// 调试版 content.js - 用于收集详细日志信息

// 全局变量
let autoNumberingEnabled = false;
let observer = null;
let numberingApplied = false;
let numberedElements = new Set();
const AUTO_NUMBER_CLASS = 'notion-auto-number';
const AUTO_NUMBER_ATTR = 'data-auto-numbered';

// 调试日志控制
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

// 应用序号到标题
function applyNumbering() {
  log('开始应用序号');
  
  // 如果有观察器，暂时断开连接
  let tempObserver = null;
  if (observer) {
    log('暂时断开MutationObserver');
    tempObserver = observer;
    observer = null;
    tempObserver.disconnect();
  }
  
  try {
    // 清除先前的序号
    removeNumbering(true);
    
    // 查找所有Notion的标题元素
    const headings = findHeadings();
    log(`找到 ${headings.length} 个标题元素`);
    
    if (headings.length === 0) {
      log('未找到标题元素，应用序号操作终止');
      return;
    }
    
    // 记录每个标题的信息，便于调试
    log('标题元素详情:', headings.map(h => ({
      tagName: h.tagName,
      className: h.className,
      textContent: h.textContent.substring(0, 30) + (h.textContent.length > 30 ? '...' : '')
    })));
    
    // 初始化计数器数组和当前层级
    const counters = [0, 0, 0, 0, 0, 0]; // 支持6级标题
    let currentLevel = 0;
    
    // 遍历所有标题
    headings.forEach((heading, index) => {
      // 获取标题级别 (1-6)
      const level = getHeadingLevel(heading);
      
      log(`处理第 ${index+1}/${headings.length} 个标题: 级别=${level}, 文本="${heading.textContent.substring(0, 30) + (heading.textContent.length > 30 ? '...' : '')}"`);
      
      if (level === 0) {
        logWarning(`跳过无法确定级别的标题元素`, heading);
        return; // 如果不是有效的标题，跳过
      }
      
      // 更新计数器数组
      if (level <= currentLevel) {
        // 如果当前标题级别小于等于上一个标题，重置后面级别的计数器
        for (let i = level; i <= 6; i++) {
          if (i > level) counters[i - 1] = 0;
        }
      } else {
        // 如果当前标题级别大于上一个标题，确保中间级别计数器初始化
        for (let i = currentLevel + 1; i < level; i++) {
          counters[i - 1] = 1;
        }
      }
      
      // 增加当前级别的计数器
      counters[level - 1]++;
      currentLevel = level;
      
      // 生成序号字符串
      let numberingStr = '';
      for (let i = 0; i < level; i++) {
        numberingStr += counters[i] + (i < level - 1 ? '.' : ' ');
      }
      
      log(`应用序号: "${numberingStr}" 到标题`);
      
      // 添加序号到标题
      addNumberToHeading(heading, numberingStr);
      
      // 标记已处理元素
      numberedElements.add(heading);
    });
    
    log(`应用序号完成，处理了 ${numberedElements.size} 个标题`);
    numberingApplied = true;
  } catch (e) {
    logError('应用序号过程中发生错误', e);
  } finally {
    // 恢复观察器
    if (tempObserver) {
      log('重新连接MutationObserver');
      observer = tempObserver;
      setupMutationObserver();
    }
  }
}

// 查找Notion中的所有标题元素
function findHeadings() {
  log('开始查找标题元素');
  const headings = [];
  
  // 基于前面分析页面结构后收集的选择器
  // 以下选择器会根据实际分析结果调整
  
  // 1. 页面标题
  const pageTitleSelectors = [
    '.notion-page-block .notion-page-content .notion-title-block',
    '.notion-frame .notion-scroller .notion-page-content h1.notion-heading-1',
    '.notranslate.notion-page-name'
  ];
  
  // 2. 内容标题 (h1-h3)
  const contentHeadingSelectors = [
    '.notion-frame .notion-scroller .notion-page-content h1.notion-heading-1',
    '.notion-frame .notion-scroller .notion-page-content h2.notion-heading-2',
    '.notion-frame .notion-scroller .notion-page-content h3.notion-heading-3',
    'div[data-block-id] div[style*="font-size"]'
  ];
  
  // 3. 其他可能的块级标题
  const blockHeadingSelectors = [
    '.notion-header-block',
    '.notion-sub_header-block',
    '.notion-sub_sub_header-block',
    'div[class*="header-block"]'
  ];
  
  // 测试每组选择器
  testSelectors('页面标题选择器', pageTitleSelectors);
  testSelectors('内容标题选择器', contentHeadingSelectors);
  testSelectors('块级标题选择器', blockHeadingSelectors);
  
  // 合并所有选择器
  const allSelectors = [...pageTitleSelectors, ...contentHeadingSelectors, ...blockHeadingSelectors].join(', ');
  
  log(`使用合并后的选择器: ${allSelectors}`);
  
  // 尝试查找所有标题元素
  try {
    const elements = document.querySelectorAll(allSelectors);
    log(`选择器找到 ${elements.length} 个元素`);
    
    elements.forEach(el => {
      // 过滤掉已有序号的元素
      if (!el.hasAttribute(AUTO_NUMBER_ATTR)) {
        headings.push(el);
      }
    });
  } catch (e) {
    logError('查找标题元素出错:', e);
  }
  
  return headings;
}

// 测试选择器组
function testSelectors(groupName, selectors) {
  log(`测试选择器组: ${groupName}`);
  
  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      log(`  选择器 "${selector}" 找到 ${elements.length} 个元素`);
    } catch (e) {
      logError(`  选择器 "${selector}" 测试失败`, e);
    }
  });
}

// 获取标题的级别 (1-6)
function getHeadingLevel(heading) {
  if (!heading || heading.nodeType !== Node.ELEMENT_NODE) {
    logWarning('无效的标题元素', heading);
    return 0;
  }
  
  // 检查元素的类名或标签名来确定级别
  const tagName = heading.tagName.toLowerCase();
  
  log(`分析标题级别 - 标签名: ${tagName}, 类名列表: [${heading.classList ? Array.from(heading.classList).join(', ') : '无'}]`);
  
  if (tagName.match(/h[1-6]/)) {
    // 如果是h1-h6标签，直接从标签名获取级别
    const level = parseInt(tagName.substring(1));
    log(`基于标签名确定级别: ${level}`);
    return level;
  }
  
  // 从类名判断级别
  if (heading.classList) {
    if (heading.classList.contains('notion-heading-1') || 
        heading.classList.contains('notion-header-block') ||
        heading.classList.contains('notion-title-block')) {
      log('基于类名确定级别: 1');
      return 1;
    } else if (heading.classList.contains('notion-heading-2') || 
               heading.classList.contains('notion-sub_header-block')) {
      log('基于类名确定级别: 2');
      return 2;
    } else if (heading.classList.contains('notion-heading-3') || 
               heading.classList.contains('notion-sub_sub_header-block')) {
      log('基于类名确定级别: 3');
      return 3;
    }
  }
  
  // 基于样式判断级别 (适用于Notion的动态样式)
  try {
    const style = window.getComputedStyle(heading);
    const fontSize = parseInt(style.fontSize);
    
    log(`基于样式分析 - 字体大小: ${fontSize}px, 字重: ${style.fontWeight}`);
    
    // 根据字体大小判断级别 (这个需要根据Notion的实际情况调整)
    if (fontSize >= 40) {
      log('基于字体大小确定级别: 1 (>=40px)');
      return 1;
    } else if (fontSize >= 30) {
      log('基于字体大小确定级别: 2 (30-39px)');
      return 2;
    } else if (fontSize >= 24) {
      log('基于字体大小确定级别: 3 (24-29px)');
      return 3;
    }
  } catch (e) {
    logError('获取计算样式失败', e);
  }
  
  // 默认情况
  logWarning('无法确定标题级别，返回默认值0');
  return 0;
}

// 为标题添加序号
function addNumberToHeading(heading, numberStr) {
  if (!heading || heading.hasAttribute(AUTO_NUMBER_ATTR)) {
    logWarning('跳过已处理或无效的标题元素');
    return;
  }
  
  log(`为标题添加序号: "${numberStr}"`);
  
  try {
    // 创建序号元素
    const numberSpan = document.createElement('span');
    numberSpan.textContent = numberStr;
    numberSpan.className = AUTO_NUMBER_CLASS;
    numberSpan.style.marginRight = '6px';
    numberSpan.style.fontWeight = heading.style.fontWeight || 'inherit';
    numberSpan.style.color = heading.style.color || 'inherit';
    
    // 插入序号
    heading.insertBefore(numberSpan, heading.firstChild);
    
    // 标记此元素已添加序号
    heading.setAttribute(AUTO_NUMBER_ATTR, 'true');
    
    log('序号添加成功');
  } catch (e) {
    logError('添加序号过程中发生错误', e);
  }
}

// 移除所有序号
function removeNumbering(isInternal = false) {
  if (!isInternal) {
    log('开始移除所有序号');
  }
  
  try {
    // 移除所有添加的序号元素
    const numberElements = document.querySelectorAll('.' + AUTO_NUMBER_CLASS);
    log(`找到 ${numberElements.length} 个序号元素准备移除`);
    
    numberElements.forEach(numElement => {
      numElement.remove();
    });
    
    // 移除所有标记
    const markedElements = document.querySelectorAll('[' + AUTO_NUMBER_ATTR + ']');
    log(`找到 ${markedElements.length} 个带标记的元素准备移除标记`);
    
    markedElements.forEach(element => {
      element.removeAttribute(AUTO_NUMBER_ATTR);
    });
    
    // 清除标记的集合
    numberedElements.clear();
    numberingApplied = false;
    
    if (!isInternal) {
      log('所有序号已移除');
    }
  } catch (e) {
    logError('移除序号过程中发生错误', e);
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  log('页面正在加载，等待DOMContentLoaded事件');
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  log('页面已加载完成，直接初始化');
  initialize();
} 