(function injectRedirectButton() {
  const container = document.querySelector('#mainLogin');
  if (!container) return;

  if (document.getElementById('baw-redirect-btn')) return;

  const button = document.createElement('button');
  button.className = "bx--btn bx--btn--primary bx--btn--field login-button";
  button.type = "button";
  button.id = "baw-redirect-btn";
  button.style.marginTop = "16px";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.gap = "4px";

  const span = document.createElement('span');
  span.dataset.localeId = "continue";
  span.textContent = "Redirecionar para o BAW";

  // SVG no mesmo estilo do botão original
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "bx--btn__icon");
  svg.setAttribute("style", "will-change: transform;");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M9.3 3.7L13.1 7.5 1 7.5 1 8.5 13.1 8.5 9.3 12.3 10 13 15 8 10 3z");

  svg.appendChild(path);

  button.appendChild(span);
  button.appendChild(svg);

  button.onclick = () => {
    const url = new URL(window.location.href);
    const target = url.searchParams.get("URL");
  
    if (target) {
      chrome.storage?.sync.get({ bawRedirectHostname: '' }, (data) => {
        const hostname = data.bawRedirectHostname || 'ppsa-br.bpm.ibmcloud.com';
        const fullUrl = `https://${hostname}${decodeURIComponent(target)}`;
        window.location.href = fullUrl;
      });
    } else {
      console.warn("⚠️ Parâmetro 'URL' não encontrado na query.");
    }
  };
  

  container.appendChild(button);

  const loginButton = document.getElementById("loadingTrigger");
  if (loginButton?.parentElement) {
    const wrapper = loginButton.parentElement;
    wrapper.style.display = "flex";
    wrapper.style.gap = "8px";
    wrapper.style.alignItems = "center";
    wrapper.style.flexWrap = "wrap";
  }
})();
