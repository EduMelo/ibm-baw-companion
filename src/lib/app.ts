import { handleReopenProcessCenter } from './utils';

if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
  chrome.storage.sync.get('reopenProcessCenterEnabled', (data) => {
    if (data.reopenProcessCenterEnabled) {
      handleReopenProcessCenter();
    }
  });
} else {
  console.warn("⚠️ API do Chrome não disponível neste contexto.");
}
