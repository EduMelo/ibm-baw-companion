document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('toggleReopen') as HTMLInputElement;
  const hostnameInput = document.getElementById('hostname') as HTMLInputElement;
  const basicAuthInput = document.getElementById('bpmBasicAuth') as HTMLInputElement;

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

  // Credencial fica em storage.local (não sincronizada entre dispositivos) por ser sensível.
  chrome.storage?.local.get({ bpmBasicAuthCredentials: '' }, (data) => {
    basicAuthInput.value = data.bpmBasicAuthCredentials || '';
  });

  checkbox.addEventListener('change', () => {
    chrome.storage?.sync.set({ reopenProcessCenterEnabled: checkbox.checked });
  });

  hostnameInput.addEventListener('input', () => {
    chrome.storage?.sync.set({ bawRedirectHostname: hostnameInput.value });
  });

  basicAuthInput.addEventListener('input', () => {
    chrome.storage?.local.set({ bpmBasicAuthCredentials: basicAuthInput.value });
  });
});
