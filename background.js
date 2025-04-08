// 插件安装或更新时触发
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // 首次安装时初始化设置
    chrome.storage.sync.set({ autoNumbering: false }, function() {
      console.log('Notion自动标题序号插件已安装，初始设置已完成');
    });
  }
});

// 当图标被点击时，如果当前不是Notion页面，显示提示
chrome.action.onClicked.addListener(function(tab) {
  if (!tab.url.includes('notion.so')) {
    // 可以考虑显示通知或其他操作
    console.log('请在Notion页面使用此插件');
  }
}); 