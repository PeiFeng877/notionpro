document.addEventListener('DOMContentLoaded', function() {
  const autoNumberingCheckbox = document.getElementById('autoNumbering');
  const applyNowButton = document.getElementById('applyNow');
  const statusElement = document.getElementById('status');
  
  // 检查当前是否在Notion页面
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const isNotionPage = tabs[0] && tabs[0].url && tabs[0].url.includes('notion.so');
    
    if (!isNotionPage) {
      statusElement.textContent = '请在Notion页面中使用此插件';
      statusElement.style.color = '#666';
      
      // 禁用按钮
      autoNumberingCheckbox.disabled = true;
      applyNowButton.disabled = true;
      applyNowButton.style.opacity = 0.5;
      return;
    }
    
    // 从存储中加载当前设置
    chrome.storage.sync.get('autoNumbering', function(data) {
      autoNumberingCheckbox.checked = data.autoNumbering || false;
      
      if (autoNumberingCheckbox.checked) {
        statusElement.textContent = '自动序号功能已启用';
      } else {
        statusElement.textContent = '自动序号功能已禁用';
      }
    });
  });
  
  // 保存自动序号开关状态
  autoNumberingCheckbox.addEventListener('change', function() {
    chrome.storage.sync.set({ autoNumbering: this.checked });
    
    // 更新状态显示
    if (this.checked) {
      statusElement.textContent = '自动序号功能已启用';
    } else {
      statusElement.textContent = '自动序号功能已禁用';
    }
    
    // 向当前标签页发送消息，更新自动序号状态
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('notion.so')) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'toggleAutoNumbering', 
          enabled: autoNumberingCheckbox.checked 
        });
      }
    });
  });
  
  // 立即应用序号按钮
  applyNowButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('notion.so')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'applyNumbering' });
        statusElement.textContent = '已应用序号到所有标题';
        
        // 短暂延迟后恢复状态显示
        setTimeout(() => {
          statusElement.textContent = autoNumberingCheckbox.checked ? 
            '自动序号功能已启用' : '自动序号功能已禁用';
        }, 2000);
      }
    });
  });
}); 