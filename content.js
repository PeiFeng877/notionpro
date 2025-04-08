// 调试版 content.js - 用于收集详细日志信息

// 全局变量
let autoNumberingEnabled = false;
let observer = null;
let styleElement = null; // 存储添加到页面的样式元素
const DEBUG = true;
const LOG_PREFIX = '[Notion标题序号插件] ';

// 调试日志函数
function log(message, data) {
  if (!DEBUG) return;
  
  if (data) {
    console.log(LOG_PREFIX + message, data);
  } else {
    console.log(LOG_PREFIX + message);
  }
}

function logError(message, error) {
  if (!DEBUG) return;
  
  console.error(LOG_PREFIX + message, error);
}

function logWarning(message, data) {
  if (!DEBUG) return;
  
  if (data) {
    console.warn(LOG_PREFIX + message, data);
  } else {
    console.warn(LOG_PREFIX + message);
  }
}

// 初始化插件
function initialize() {
  log('插件初始化开始');
  
  // 获取保存的设置
  chrome.storage.sync.get('autoNumbering', function(data) {
    autoNumberingEnabled = data.autoNumbering || false;
    log('自动序号功能状态:', autoNumberingEnabled ? '已启用' : '已禁用');
    
    if (autoNumberingEnabled) {
      log('准备应用序号');
      applyNumbering();
    }
    
    // 设置观察器
    setupMutationObserver();
  });
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    log('收到消息:', request);
    
    switch(request.action) {
      case 'toggleAutoNumbering':
        autoNumberingEnabled = request.enabled;
        log('切换自动序号状态为:', autoNumberingEnabled ? '启用' : '禁用');
        
        if (autoNumberingEnabled) {
          applyNumbering();
        } else {
          removeNumbering();
        }
        break;
      case 'applyNumbering':
        log('手动应用序号');
        applyNumbering();
        break;
      case 'removeNumbering':
        log('手动移除序号');
        removeNumbering();
        break;
    }
    
    log('响应消息');
    sendResponse({ status: 'success' });
    return true;
  });
  
  // 页面DOM结构分析
  analyzeNotionStructure();
  
  log('插件初始化完成');
}

// 设置DOM变化的观察器
function setupMutationObserver() {
  log('设置MutationObserver');
  
  // 如果已经有观察器，先断开连接
  if (observer) {
    log('断开现有观察器');
    observer.disconnect();
  }
  
  // 记录观察器触发次数和时间
  let observerCallCount = 0;
  let lastCallTime = 0;
  let isProcessing = false;
  
  // 创建新的观察器
  observer = new MutationObserver(function(mutations) {
    observerCallCount++;
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    lastCallTime = now;
    
    if (isProcessing) {
      log(`MutationObserver回调被忽略 - 已有处理中的回调 (总调用次数: ${observerCallCount})`);
      return;
    }
    
    log(`MutationObserver触发 (第${observerCallCount}次, 距上次${timeSinceLastCall}ms)`);
    log('变更详情:', mutations);
    
    // 记录包含标题元素相关变更的变更数
    let headingRelatedChanges = 0;
    mutations.forEach(mutation => {
      if (isHeadingRelatedMutation(mutation)) {
        headingRelatedChanges++;
      }
    });
    
    log(`检测到${headingRelatedChanges}个与标题相关的变更`);
    
    if (autoNumberingEnabled && document.readyState === 'complete' && headingRelatedChanges > 0) {
      log('触发序号应用操作 (使用防抖)');
      
      isProcessing = true;
      try {
        // 使用防抖函数延迟执行，避免频繁更新
        debounce(function() {
          try {
            applyNumbering();
          } finally {
            isProcessing = false;
          }
        }, 500)();
      } catch (e) {
        logError('防抖调用异常', e);
        isProcessing = false;
      }
    } else {
      if (!autoNumberingEnabled) {
        log('自动序号功能已禁用，不处理变更');
      } else if (document.readyState !== 'complete') {
        log('页面尚未完全加载，不处理变更');
      } else if (headingRelatedChanges === 0) {
        log('没有与标题相关的变更，不处理');
      }
    }
  });
  
  try {
    // 查找主要内容容器
    const contentContainer = findMainContentContainer();
    
    if (contentContainer) {
      log('找到主要内容容器:', contentContainer);
      log('开始观察内容容器 (优化范围)');
      
      // 仅观察内容容器
      observer.observe(contentContainer, {
        childList: true,
        subtree: true,
        characterData: false  // 减少触发频率
      });
    } else {
      logWarning('未找到主要内容容器，观察整个body');
      
      // 降级方案：观察整个body
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false  // 减少触发频率
      });
    }
  } catch (e) {
    logError('设置MutationObserver失败', e);
  }
}

// 判断变更是否与标题相关
function isHeadingRelatedMutation(mutation) {
  // 如果是characterData类型的变更，检查其目标节点是否在标题内部
  if (mutation.type === 'characterData') {
    let node = mutation.target;
    while (node && node !== document.body) {
      if (isHeadingElement(node)) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  
  // 如果是childList类型的变更，检查添加或删除的节点中是否包含标题元素
  if (mutation.type === 'childList') {
    // 检查添加的节点
    for (let i = 0; i < mutation.addedNodes.length; i++) {
      const node = mutation.addedNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (isHeadingElement(node)) {
          return true;
        }
        // 如果节点内部包含标题元素
        if (node.querySelector && node.querySelector('h1, h2, h3, [class*="heading"]')) {
          return true;
        }
      }
    }
    
    // 检查删除的节点 (较难检查，因为已从DOM中移除)
    for (let i = 0; i < mutation.removedNodes.length; i++) {
      const node = mutation.removedNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 根据类名或标签名做简单判断
        if (node.tagName && /^H[1-6]$/i.test(node.tagName)) {
          return true;
        }
        if (node.className && typeof node.className === 'string' && 
            (node.className.includes('heading') || node.className.includes('header'))) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// 判断元素是否为标题元素
function isHeadingElement(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  
  // 通过标签名判断
  if (/^H[1-6]$/i.test(element.tagName)) {
    return true;
  }
  
  // 通过类名判断
  if (element.classList) {
    for (let i = 0; i < element.classList.length; i++) {
      const className = element.classList[i];
      if (className.includes('heading') || className.includes('header') || 
          className.includes('title-block')) {
        return true;
      }
    }
  }
  
  return false;
}

// 查找主要内容容器
function findMainContentContainer() {
  // 尝试查找可能的内容容器选择器
  const possibleSelectors = [
    '.notion-page-content',
    '.notion-frame .notion-scroller',
    '.notion-app-inner'
  ];
  
  for (const selector of possibleSelectors) {
    try {
      const container = document.querySelector(selector);
      if (container) {
        return container;
      }
    } catch (e) {
      logError(`选择器 ${selector} 查询失败`, e);
    }
  }
  
  return null;
}

// 分析Notion页面结构
function analyzeNotionStructure() {
  log('开始分析Notion页面结构');
  
  // 记录所有可能的标题相关类名
  const headingClassNames = new Set();
  
  // 查找所有可能是标题的元素
  const allElements = document.querySelectorAll('*');
  log(`页面包含 ${allElements.length} 个元素`);
  
  let headingElements = [];
  
  // 分析所有元素
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    
    // 分析可能的标题元素
    if (el.nodeType === Node.ELEMENT_NODE) {
      // 基于标签名
      if (/^H[1-6]$/i.test(el.tagName)) {
        headingElements.push(el);
      }
      
      // 基于类名
      if (el.className && typeof el.className === 'string') {
        const classNames = el.className.split(' ');
        classNames.forEach(className => {
          if (className.includes('heading') || 
              className.includes('header') || 
              className.includes('title')) {
            headingClassNames.add(className);
            headingElements.push(el);
          }
        });
      }
    }
  }
  
  // 记录找到的可能是标题的元素
  log(`找到 ${headingElements.length} 个可能的标题元素`);
  
  if (headingElements.length > 0) {
    // 仅记录前10个
    log('前10个可能的标题元素:', headingElements.slice(0, 10));
  }
  
  // 记录所有相关类名
  log('找到的标题相关类名:', Array.from(headingClassNames));
  
  // 尝试找出层级关系
  const headingLevels = {};
  
  headingElements.forEach(el => {
    // 获取计算样式
    const style = window.getComputedStyle(el);
    const fontSize = parseInt(style.fontSize);
    const fontWeight = style.fontWeight;
    
    // 记录样式信息
    if (!headingLevels[el.tagName]) {
      headingLevels[el.tagName] = {
        count: 0,
        fontSizes: [],
        fontWeights: []
      };
    }
    
    headingLevels[el.tagName].count++;
    
    if (!headingLevels[el.tagName].fontSizes.includes(fontSize)) {
      headingLevels[el.tagName].fontSizes.push(fontSize);
    }
    
    if (!headingLevels[el.tagName].fontWeights.includes(fontWeight)) {
      headingLevels[el.tagName].fontWeights.push(fontWeight);
    }
  });
  
  log('标题元素层级分析:', headingLevels);
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    
    log(`防抖函数调用 (等待时间: ${wait}ms)`);
    
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      log('防抖延迟结束，执行函数');
      func.apply(context, args);
    }, wait);
  };
}

// 直接修改标题内容实现自动编号
function applyNumbering() {
  log('开始应用序号 (直接内容修改方法)');
  
  try {
    // 直接编辑标题内容，添加序号
    applyDirectNumbering();
    
    log('直接内容编号应用完成');
  } catch (e) {
    logError('应用序号过程中发生错误', e);
  }
}

// 直接编辑标题内容的函数
function applyDirectNumbering() {
  log('开始直接修改标题内容...');
  
  // 获取所有标题元素
  const h1Elements = document.querySelectorAll('.notion-header-block > div > h2');
  const h2Elements = document.querySelectorAll('.notion-sub_header-block > div > h3');
  const h3Elements = document.querySelectorAll('.notion-sub_sub_header-block > div > h3');
  
  log(`找到标题: 一级=${h1Elements.length}, 二级=${h2Elements.length}, 三级=${h3Elements.length}`);
  
  // 重置计数器
  let h1Counter = 0;
  let h2Counter = 0;
  let h3Counter = 0;
  
  // 处理一级标题
  h1Elements.forEach(el => {
    // 检查是否已有编号
    if (!el.textContent.match(/^\d+\.\s/)) {
      h1Counter++;
      h2Counter = 0; // 重置下级计数器
      h3Counter = 0;
      
      // 保存原内容
      const originalContent = el.textContent;
      
      // 设置新内容
      el.textContent = `${h1Counter}. ${originalContent}`;
      
      // 触发输入事件
      triggerInputEvent(el);
      
      log(`已编号一级标题: ${h1Counter}. ${originalContent}`);
    } else {
      log(`标题已有编号: ${el.textContent}`);
    }
  });
  
  // 处理二级标题
  h2Elements.forEach(el => {
    if (!el.textContent.match(/^\d+\.\d+\.\s/)) {
      h2Counter++;
      h3Counter = 0; // 重置下级计数器
      
      const originalContent = el.textContent;
      el.textContent = `${h1Counter}.${h2Counter}. ${originalContent}`;
      triggerInputEvent(el);
      
      log(`已编号二级标题: ${h1Counter}.${h2Counter}. ${originalContent}`);
    }
  });
  
  // 处理三级标题
  h3Elements.forEach(el => {
    if (!el.textContent.match(/^\d+\.\d+\.\d+\.\s/)) {
      h3Counter++;
      
      const originalContent = el.textContent;
      el.textContent = `${h1Counter}.${h2Counter}.${h3Counter}. ${originalContent}`;
      triggerInputEvent(el);
      
      log(`已编号三级标题: ${h1Counter}.${h2Counter}.${h3Counter}. ${originalContent}`);
    }
  });
}

// 触发输入事件确保Notion保存内容
function triggerInputEvent(element) {
  try {
    // 聚焦元素
    element.focus();
    
    // 创建并分发输入事件
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText'
    });
    element.dispatchEvent(inputEvent);
    
    // 创建并分发变化事件
    const changeEvent = new Event('change', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(changeEvent);
    
    // 失去焦点
    element.blur();
  } catch (e) {
    logError('触发事件失败', e);
  }
}

// 移除序号
function removeNumbering() {
  log('移除序号样式');
  
  // 移除任何CSS样式元素 (保留这部分以兼容旧版实现)
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
    log('序号样式已移除');
  } else {
    // 查找并移除任何可能的编号样式元素
    const existingStyle = document.getElementById('notion-auto-numbering-style');
    if (existingStyle) {
      existingStyle.remove();
      log('找到并移除现有序号样式');
    } else {
      log('未找到序号样式元素');
    }
  }
  
  // 注意：我们不会尝试移除已添加到标题内容中的编号
  // 因为这是永久性修改，移除它们可能会引起混淆
  log('注意：已添加到标题内容中的编号不会被移除');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  log('页面正在加载，等待DOMContentLoaded事件');
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  log('页面已加载完成，直接初始化');
  initialize();
} 