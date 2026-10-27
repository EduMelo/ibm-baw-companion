/**
 * Content script injetado nas páginas do Process Inspector
 * (https://ppsa-br.bpm.ibmcloud.com/bpm/{dev|test|run}/ProcessInspector/...).
 *
 * Responsabilidades:
 *  1. Detectar o ambiente (env) a partir da URL e o piid a partir do painel
 *     de resumo da instância (InstanceSummary).
 *  2. Adicionar, ao lado de cada item da lista de tarefas (TasksPane), um
 *     ícone de "recorrência" que permite reexecutar aquele passo do processo.
 *  3. Ao clicar no ícone, exibir um par de botões de confirmação (aceitar/
 *     recusar) ao lado dele. Só ao aceitar é que a orquestração do moveToken
 *     reflexivo é disparada de fato: busca a executionTree da instância via
 *     REST, localiza o nó cujo createdTaskIDs contenha o taskId da tarefa
 *     clicada e então dispara o moveToken usando o tokenId/flowObjectId
 *     daquele nó. Ao final, clica no botão "Refresh" da toolbar para
 *     recarregar o estado da instância. Recusar (ou clicar de novo no ícone)
 *     apenas fecha os botões, sem nenhuma chamada à API.
 *  4. Adicionar, logo abaixo do painel de resumo da instância (summaryNode),
 *     uma linha de comandos com um ícone que abre a mesma instância no
 *     Process Portal (launchInstanceUI) em uma nova aba, sem fechar o
 *     Process Inspector.
 *
 * Observação sobre seletores: os ids dos widgets Dojo (ex.: "InstanceSummary_31",
 * "ActionItem_594") incluem um contador incremental que muda a cada carga da
 * página, então não são estáveis entre sessões. Por isso usamos seletores
 * baseados em classes e em atributos "data-dojo-attach-point", que fazem
 * parte do template do widget e são sempre os mesmos.
 *
 * Tudo fica dentro de uma IIFE para não vazar identificadores para o escopo
 * global compartilhado com os demais content scripts (tsconfig usa
 * "module": "None").
 */
(function bawProcessInspector() {
  const REFLEXIVE_TRIGGER_CLASS = 'baw-reflexive-btn';
  const REFLEXIVE_LOADING_CLASS = 'baw-reflexive-loading';
  const BOUND_ATTR = 'data-baw-reflexive-bound';
  const COMMANDS_ROW_CLASS = 'baw-instance-commands-row';
  const LAUNCH_TRIGGER_CLASS = 'baw-launch-btn';
  const COMMANDS_BOUND_ATTR = 'data-baw-commands-bound';
  const CONFIRM_GROUP_CLASS = 'baw-reflexive-confirm-group';
  const CONFIRM_BTN_CLASS = 'baw-reflexive-confirm-btn';

  interface ExecutionTreeNode {
    name?: string | null;
    nodeId?: string | null;
    flowObjectId?: string | null;
    tokenId?: string | null;
    createdTaskIDs?: Array<string | number> | null;
    children?: ExecutionTreeNode[] | null;
    [key: string]: unknown;
  }

  function isHtmlElement(node: Element | null): node is HTMLElement {
    return !!node && node.nodeType === Node.ELEMENT_NODE;
  }

  /** Extrai o env (dev | test | run) a partir do caminho atual da URL. */
  function getCurrentEnv(): string | null {
    const match = window.location.pathname.match(/\/bpm\/([^/]+)\/ProcessInspector\b/i);
    return match ? match[1] : null;
  }

  /** Extrai o piid a partir do painel "Instance ID" do resumo da instância. */
  function getCurrentPiid(): string | null {
    const valueNode = document.querySelector('.summaryNode [data-dojo-attach-point="instanceId"]');
    const text = valueNode?.textContent?.trim();
    return text || null;
  }

  /** Extrai o número entre colchetes no final do texto (o taskId). */
  function extractTaskId(source: string | null | undefined): string | null {
    if (!source) return null;
    const match = source.match(/\[(\d+)\]\s*$/);
    return match ? match[1] : null;
  }

  function buildProcessApiUrl(env: string, piid: string, query: string): string {
    const base = `${window.location.origin}/bpm/${encodeURIComponent(env)}/rest/bpm/wle/v1/process/${encodeURIComponent(piid)}`;
    return `${base}?${query}`;
  }

  /** Monta a URL do Process Portal que abre a UI da instância em execução. */
  function buildProcessPortalLaunchUrl(env: string, piid: string): string {
    return `${window.location.origin}/bpm/${encodeURIComponent(env)}/ProcessPortal/launchInstanceUI?instanceId=${encodeURIComponent(
      piid
    )}`;
  }

  /** Codifica uma string (potencialmente com acentos) em Base64 de forma segura. */
  function base64EncodeUtf8(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  /** Lê a credencial configurada na página de opções e monta o header Basic. */
  function getBasicAuthHeader(): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get({ bpmBasicAuthCredentials: '' }, (data) => {
        const raw = String(data.bpmBasicAuthCredentials || '').trim();
        resolve(raw ? `Basic ${base64EncodeUtf8(raw)}` : null);
      });
    });
  }

  /** Busca recursivamente, em toda a executionTree, o nó que criou o taskId informado. */
  function findNodeByTaskId(node: ExecutionTreeNode | null | undefined, taskId: string): ExecutionTreeNode | null {
    if (!node) return null;
    if (Array.isArray(node.createdTaskIDs) && node.createdTaskIDs.some((id) => String(id) === taskId)) {
      return node;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findNodeByTaskId(child, taskId);
        if (found) return found;
      }
    }
    return null;
  }

  function ensureToastContainer(): HTMLElement {
    let container = document.querySelector('.baw-reflexive-toast-container') as HTMLElement | null;
    if (!container) {
      container = document.createElement('div');
      container.className = 'baw-reflexive-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message: string, kind: 'success' | 'error'): void {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `baw-reflexive-toast ${kind}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('baw-visible'));

    window.setTimeout(() => {
      toast.classList.remove('baw-visible');
      window.setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  function setTriggerLoading(trigger: HTMLElement, loading: boolean): void {
    trigger.classList.toggle(REFLEXIVE_LOADING_CLASS, loading);
  }

  /**
   * Localiza o botão "Refresh" da toolbar do Process Inspector. Assim como os
   * demais seletores deste arquivo, evita o id numérico dinâmico (ex.:
   * "ActionItem_180") e usa classe + title, que são estáveis entre sessões.
   */
  function findRefreshButton(): HTMLElement | null {
    const button = document.querySelector('.actionItem button.labelAndIconNode.refresh[title="Refresh"]');
    return isHtmlElement(button) ? button : null;
  }

  /** Clica no botão de Refresh para que o Process Inspector recarregue os dados da instância. */
  function clickRefreshButton(): void {
    const button = findRefreshButton();
    if (!button) {
      console.warn('BAW Companion: botão de Refresh não encontrado para atualizar o Process Inspector.');
      return;
    }
    button.click();
  }

  /** Ícone de "recorrência" (duas setas formando um laço), estilo Material "autorenew". */
  function createRecurrenceIcon(): SVGSVGElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute(
      'd',
      'M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .51-.1 1-.24 1.46l1.52 1.52c.46-.86.72-1.84.72-2.98 0-3.86-3.14-7-7-7zm0 12c-2.76 0-5-2.24-5-5 0-.51.1-1 .24-1.46L5.72 10.02C5.26 10.88 5 11.86 5 13c0 3.86 3.14 7 7 7v3l4-4-4-4v3z'
    );
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  /** Ícone de "abrir externamente" (estilo Material "open_in_new"), usado para o launch no Process Portal. */
  function createLaunchIcon(): SVGSVGElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute(
      'd',
      'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19.59 6.41V10H21V3h-7z'
    );
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  /** Ícone de "confirmar" (check), estilo Material "check". */
  function createCheckIcon(): SVGSVGElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  /** Ícone de "cancelar" (x), estilo Material "close". */
  function createCloseIcon(): SVGSVGElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute(
      'd',
      'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
    );
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  async function runReflexiveMoveToken(taskId: string, trigger: HTMLElement): Promise<void> {
    const env = getCurrentEnv();
    const piid = getCurrentPiid();

    if (!env || !piid) {
      showToast('BAW Companion: não foi possível identificar o ambiente (env) ou a instância (piid) desta página.', 'error');
      return;
    }

    const authHeader = await getBasicAuthHeader();
    if (!authHeader) {
      showToast('BAW Companion: configure a autenticação Basic na página de opções da extensão.', 'error');
      return;
    }

    setTriggerLoading(trigger, true);
    try {
      const treeUrl = buildProcessApiUrl(env, piid, 'parts=executionTree');
      const treeResponse = await fetch(treeUrl, {
        method: 'GET',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!treeResponse.ok) {
        throw new Error(`Falha ao consultar executionTree (HTTP ${treeResponse.status}).`);
      }
      const treePayload = await treeResponse.json();
      const root: ExecutionTreeNode | undefined = treePayload?.data?.executionTree?.root;
      const node = findNodeByTaskId(root, taskId);

      if (!node) {
        throw new Error(`Tarefa ${taskId} não foi encontrada na executionTree da instância.`);
      }
      if (!node.tokenId || !node.flowObjectId) {
        throw new Error(`Tarefa ${taskId} foi encontrada, mas sem tokenId/flowObjectId na executionTree.`);
      }

      const moveUrl = buildProcessApiUrl(
        env,
        piid,
        `action=moveToken&tokenId=${encodeURIComponent(String(node.tokenId))}&target=${encodeURIComponent(
          String(node.flowObjectId)
        )}&parts=executionTree`
      );
      const moveResponse = await fetch(moveUrl, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!moveResponse.ok) {
        throw new Error(`Falha ao executar moveToken (HTTP ${moveResponse.status}).`);
      }
      await moveResponse.json().catch(() => null);

      // Ao final da orquestração, clica no "Refresh" da toolbar para que o
      // Process Inspector recarregue o estado atualizado da instância.
      clickRefreshButton();

      showToast(`moveToken reflexivo executado com sucesso para a tarefa ${taskId}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('BAW Companion: falha no moveToken reflexivo.', error);
      showToast(message, 'error');
    } finally {
      setTriggerLoading(trigger, false);
    }
  }

  /**
   * Cria o par de botões de confirmação (aceitar/recusar) e os insere logo
   * após o ícone de recorrência. Só chama runReflexiveMoveToken se o usuário
   * confirmar clicando em "aceitar"; "recusar" (ou clicar de novo no ícone
   * original) apenas remove os botões, sem nenhuma chamada à API.
   */
  function showReflexiveConfirmation(trigger: HTMLElement, taskId: string): void {
    if (trigger.nextElementSibling?.classList.contains(CONFIRM_GROUP_CLASS)) return;

    const group = document.createElement('span');
    group.className = CONFIRM_GROUP_CLASS;

    const removeGroup = () => group.remove();

    const acceptBtn = document.createElement('span');
    acceptBtn.className = `${CONFIRM_BTN_CLASS} baw-confirm-accept`;
    acceptBtn.setAttribute('role', 'button');
    acceptBtn.setAttribute('tabindex', '0');
    acceptBtn.setAttribute('aria-label', `Confirmar moveToken reflexivo da tarefa ${taskId}`);
    acceptBtn.title = 'Confirmar';
    acceptBtn.appendChild(createCheckIcon());

    const declineBtn = document.createElement('span');
    declineBtn.className = `${CONFIRM_BTN_CLASS} baw-confirm-decline`;
    declineBtn.setAttribute('role', 'button');
    declineBtn.setAttribute('tabindex', '0');
    declineBtn.setAttribute('aria-label', `Cancelar moveToken reflexivo da tarefa ${taskId}`);
    declineBtn.title = 'Cancelar';
    declineBtn.appendChild(createCloseIcon());

    const bindActivate = (el: HTMLElement, handler: (event: Event) => void) => {
      el.addEventListener('click', handler);
      el.addEventListener('keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') handler(event);
      });
    };

    bindActivate(acceptBtn, (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeGroup();
      void runReflexiveMoveToken(taskId, trigger);
    });

    bindActivate(declineBtn, (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeGroup();
    });

    group.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        event.stopPropagation();
        removeGroup();
      }
    });

    group.appendChild(acceptBtn);
    group.appendChild(declineBtn);
    trigger.insertAdjacentElement('afterend', group);
  }

  function createReflexiveTrigger(taskId: string): HTMLElement {
    const trigger = document.createElement('span');
    trigger.className = REFLEXIVE_TRIGGER_CLASS;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-label', `Pedir confirmação para o moveToken reflexivo da tarefa ${taskId}`);
    trigger.title = `Repetir tarefa ${taskId} (pede confirmação antes de executar)`;
    trigger.dataset.bawTaskId = taskId;
    trigger.appendChild(createRecurrenceIcon());

    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (trigger.classList.contains(REFLEXIVE_LOADING_CLASS)) return;

      const existing = trigger.nextElementSibling;
      if (existing?.classList.contains(CONFIRM_GROUP_CLASS)) {
        // Clicar de novo no ícone enquanto a confirmação está aberta cancela.
        existing.remove();
        return;
      }

      showReflexiveConfirmation(trigger, taskId);
    };

    trigger.addEventListener('click', activate);
    trigger.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') activate(event);
    });

    return trigger;
  }

  /** Varre o painel de tarefas e adiciona o ícone de recorrência aos itens ainda não processados. */
  function installReflexiveIcons(root: ParentNode): void {
    const actionItems = Array.from(root.querySelectorAll('.actionItem')).filter(isHtmlElement);

    for (const item of actionItems) {
      const button = item.querySelector('button') as HTMLButtonElement | null;
      if (!button) continue;

      const label = button.querySelector('.labelText');
      if (!isHtmlElement(label) || label.hasAttribute(BOUND_ATTR)) continue;

      const taskId = extractTaskId(button.title) || extractTaskId(label.textContent);
      if (!taskId) continue;

      label.setAttribute(BOUND_ATTR, 'true');
      const trigger = createReflexiveTrigger(taskId);
      label.insertAdjacentElement('afterend', trigger);
    }
  }

  /** Cria a linha de comandos com o botão que abre a instância no Process Portal (em nova aba). */
  function createInstanceCommandsRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = COMMANDS_ROW_CLASS;

    const trigger = document.createElement('span');
    trigger.className = LAUNCH_TRIGGER_CLASS;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-label', 'Abrir instância no Process Portal em uma nova aba');
    trigger.title = 'Abrir instância no Process Portal em uma nova aba (launchInstanceUI)';
    trigger.appendChild(createLaunchIcon());

    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      const env = getCurrentEnv();
      const piid = getCurrentPiid();
      if (!env || !piid) {
        showToast('BAW Companion: não foi possível identificar o ambiente (env) ou a instância (piid) desta página.', 'error');
        return;
      }

      window.open(buildProcessPortalLaunchUrl(env, piid), '_blank', 'noopener,noreferrer');
    };

    trigger.addEventListener('click', activate);
    trigger.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') activate(event);
    });

    row.appendChild(trigger);
    return row;
  }

  /** Insere, logo abaixo do resumo da instância (summaryNode), a linha de comandos com o botão de launch. */
  function installInstanceCommandsRow(root: ParentNode): void {
    const summaryNodes = Array.from(root.querySelectorAll('.summaryNode')).filter(isHtmlElement);

    for (const summary of summaryNodes) {
      // O widget InstanceSummary usa ".summaryNode" tanto para o painel principal
      // (Instance ID, Status, ...) quanto para um painel secundário de erros em
      // sub-processos (".summaryNode.errorsInSTPs", normalmente de altura zero
      // pois todas as suas linhas ficam "hidden"). Só o painel principal tem o
      // attach point "instanceId"; sem esse filtro o botão aparecia duplicado.
      if (!summary.querySelector('[data-dojo-attach-point="instanceId"]')) continue;
      if (summary.hasAttribute(COMMANDS_BOUND_ATTR)) continue;
      summary.setAttribute(COMMANDS_BOUND_ATTR, 'true');
      const row = createInstanceCommandsRow();
      summary.insertAdjacentElement('afterend', row);
    }
  }

  function bootProcessInspectorEnhancements(): void {
    if (!location.pathname.includes('/ProcessInspector/')) return;
    if (!document.body) return;

    const installAll = (root: ParentNode) => {
      installReflexiveIcons(root);
      installInstanceCommandsRow(root);
    };

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        installAll(document);
      }, 200);
    };

    installAll(document);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    console.log('🔁 BAW Companion: moveToken reflexivo e atalho do Process Portal prontos no Process Inspector.');
  }

  bootProcessInspectorEnhancements();
})();
