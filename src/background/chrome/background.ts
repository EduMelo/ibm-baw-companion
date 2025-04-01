/// <reference types="chrome"/>

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("reopenProcessCenterEnabled", (data) => {
    if (data.reopenProcessCenterEnabled === undefined) {
      chrome.storage.sync.set({ reopenProcessCenterEnabled: true });
    }
  });
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_PROCESSCENTER') {
    if (sender.tab && typeof sender.tab.index === 'number') {
      chrome.tabs.create({
        url: message.url,
        active: false,
        index: sender.tab.index,
      });
    } else {
      // fallback caso não tenha info da aba
      chrome.tabs.create({ url: message.url, active: false });
    }
  }
});

