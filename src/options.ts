document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('toggleReopen') as HTMLInputElement;
  const hostnameInput = document.getElementById('hostname') as HTMLInputElement;

  chrome.storage?.sync.get(
    {
      reopenProcessCenterEnabled: true,
      bawRedirectHostname: '',
    },
    (data) => {
      checkbox.checked = !!data.reopenProcessCenterEnabled;
      hostnameInput.value = data.bawRedirectHostname || '';
    }
  );

  checkbox.addEventListener('change', () => {
    chrome.storage?.sync.set({ reopenProcessCenterEnabled: checkbox.checked });
  });

  hostnameInput.addEventListener('input', () => {
    chrome.storage?.sync.set({ bawRedirectHostname: hostnameInput.value });
  });
});
