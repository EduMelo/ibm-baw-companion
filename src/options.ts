document.addEventListener("DOMContentLoaded", () => {
    const checkbox = document.getElementById('toggleReopen') as HTMLInputElement;
  
    chrome.storage?.sync.get({'reopenProcessCenterEnabled': true}, (data) => {
      checkbox.checked = !!data.reopenProcessCenterEnabled;
    });
  
    checkbox.addEventListener('change', () => {
      chrome.storage?.sync.set({ reopenProcessCenterEnabled: checkbox.checked });
    });
  });
  