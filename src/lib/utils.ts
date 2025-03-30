export function handleReopenProcessCenter() {
  const processCenterUrl = "https://ppsa-br.bpm.ibmcloud.com/bpm/dev/ProcessCenter/repository/com.lombardisoftware.repository.Repository/Repository.jsp";
  const isProcessCenter = window.location.href.includes("/ProcessCenter/");
  const isProcessDesigner = window.location.href.includes("/WebPD/");

  if (isProcessCenter) {
    sessionStorage.setItem("origemProcessCenter", "true");
    console.log("📌 origemProcessCenter = true");
  }

  if (isProcessDesigner) {
    const origem = sessionStorage.getItem("origemProcessCenter");

    if (origem === "true") {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        sessionStorage.setItem("origemProcessCenter", "false");
        console.log("🔁 Reabrindo ProcessCenter...");
        chrome.runtime.sendMessage({ type: 'OPEN_PROCESSCENTER', url: processCenterUrl });
      } else {
        console.warn("⚠️ chrome.runtime.sendMessage não disponível neste contexto.");
      }
      
    } else {
      console.log("✅ origemProcessCenter = false, nada a fazer.");
    }
  }
}

