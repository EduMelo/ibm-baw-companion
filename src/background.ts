chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('reopenProcessCenterEnabled', (data) => {
    if (data.reopenProcessCenterEnabled === undefined) {
      chrome.storage.sync.set({ reopenProcessCenterEnabled: true });
    }
  });
});

/**
 * Ordena (via cliques simulados nos botões up/down do dijit) os itens de uma
 * árvore ordenável do Process Designer (ex.: variáveis de um serviço).
 *
 * Duas proteções importantes:
 *
 *  1. Entre cada seleção/clique simulado, aguardamos alguns quadros de
 *     animação antes de reler o estado do dijit. Sem isso, listas com
 *     MUITOS itens falhavam no meio: o laço rodava 100% síncrono e sem
 *     pausa, e às vezes líamos `tree.selectedItem`/o estado dos botões
 *     antes do dijit terminar de propagar a seleção/DOM anterior, abortando
 *     a ordenação prematuramente com "mismatch"/"disabled"/"stuck".
 *
 *  2. A cada iteração verificamos se a aba que contém a árvore (localizada
 *     dinamicamente a partir da própria árvore, sem depender do id numérico
 *     do dijit nem do texto/idioma da aba) continua selecionada. Se o
 *     usuário sair da aba no meio da ordenação, abortamos imediatamente.
 */
async function sortActionableTree(treeWidgetId: string) {
  const dijitApi = (window as any).dijit;

  const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  /**
   * Localiza o botão da aba (role="tab") que controla o painel onde a
   * árvore está, subindo pelos ancestrais até achar um id referenciado por
   * "aria-controls" (padrão ARIA de tabs, independente de idioma) ou, como
   * fallback, um elemento cujo id siga a convenção do dijit
   * "{tabContainerId}_tablist_{idDoPainel}" (a mesma estrutura usada pelo
   * botão da aba "Variables"/"Variáveis").
   *
   * As duas buscas são restritas a `[role="tab"]`: sem isso, outros widgets
   * (ex.: o foco interno de um dijit/TitlePane) também usam
   * "aria-controls"/ids com esse mesmo sufixo para fins não relacionados a
   * abas, e um casamento falso nesses elementos (que nunca têm
   * "aria-selected") fazia o código achar, incorretamente, que a aba nunca
   * estava selecionada.
   */
  function findControllingTab(start: Element): Element | null {
    let node: Element | null = start;
    while (node) {
      if (node.id) {
        const byAria = document.querySelector(`[role="tab"][aria-controls="${CSS.escape(node.id)}"]`);
        if (byAria) return byAria;
        const bySuffix = document.querySelector(`[role="tab"][id$="_tablist_${CSS.escape(node.id)}"]`);
        if (bySuffix) return bySuffix;
      }
      node = node.parentElement;
    }
    return null;
  }

  function isTabStillActive(tab: Element | null): boolean {
    return !!tab && tab.isConnected && tab.getAttribute('aria-selected') === 'true';
  }

  try {
    const tree = dijitApi.byId(treeWidgetId);
    if (!tree || !tree.domNode) return { ok: false, error: 'missing-tree' };

    const controllingTab = findControllingTab(tree.domNode);
    if (!controllingTab) return { ok: false, error: 'missing-tab' };
    if (!isTabStillActive(controllingTab)) return { ok: false, error: 'tab-changed' };

    let action: any = null;
    dijitApi.registry.forEach((widget: any) => {
      if (
        widget.tree === tree &&
        typeof widget.setSelection === 'function' &&
        typeof widget._handleUpButtonPressed === 'function'
      ) {
        action = widget;
      }
    });
    if (!action) return { ok: false, error: 'missing-action' };

    const itemNodes = (container: Element) =>
      Array.from(container.children).filter((node) => (node as Element).classList.contains('dijitTreeNode')) as HTMLElement[];
    const labelOf = (node: Element) => {
      const label = node.querySelector(':scope > .dijitTreeRow .dijitTreeLabel');
      return ((label && label.textContent) || '').trim();
    };
    const compare = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
    const isSorted = (labels: string[]) => {
      for (let i = 1; i < labels.length; i++) if (compare(labels[i - 1], labels[i]) > 0) return false;
      return true;
    };
    const nextMove = (labels: string[]) => {
      const indexed = labels.map((label, index) => ({ label, index }));
      const order = indexed.slice().sort((a, b) => compare(a.label, b.label) || a.index - b.index);
      for (let i = 0; i < order.length; i++) if (order[i].index !== i) return { from: order[i].index, to: i };
      return null;
    };

    // Seleciona o item e CONFIRMA (com algumas tentativas, cedendo um quadro
    // de animação por vez) que a seleção realmente foi aplicada antes de
    // prosseguir — ver nota no topo do arquivo sobre listas grandes.
    const focus = async (node: HTMLElement) => {
      const widget = dijitApi.byId(node.getAttribute('widgetid'));
      if (!widget) return null;
      action.setSelection(widget.item);
      for (let attempt = 0; attempt < 5; attempt++) {
        const selected = tree.getNodesByItem(tree.selectedItem)[0];
        if (selected && selected.id === widget.id) {
          return {
            up: !!action._handler.isUpEnabled(tree.selectedItem),
            down: !!action._handler.isDownEnabled(tree.selectedItem),
          };
        }
        await nextFrame();
      }
      return null;
    };

    const step = async (node: HTMLElement, direction: 'up' | 'down'): Promise<'moved' | 'mismatch' | 'disabled'> => {
      const state = await focus(node);
      if (!state) return 'mismatch';
      if (direction === 'up' ? !state.up : !state.down) return 'disabled';
      if (direction === 'up') action._handleUpButtonPressed();
      else action._handleDownButtonPressed();
      await nextFrame();
      return 'moved';
    };

    const summaries: Array<{ label: string; skipped?: boolean; clicks?: number; error?: string | null; sorted?: boolean }> = [];
    const containers = Array.from(tree.domNode.querySelectorAll('.dijitTreeNodeContainer')) as HTMLElement[];
    for (const container of containers) {
      if (!isTabStillActive(controllingTab)) return { ok: false, error: 'tab-changed', summaries };

      // Lê o rótulo de cada item (consulta "cara", com seletor aninhado) UMA
      // única vez e guarda num mapa por widgetid. Em listas grandes (muitas
      // variáveis), reler o texto de todos os itens a cada clique tornava o
      // processo extremamente lento (O(n) caro × O(n²) cliques); como o
      // texto de um item não muda — só a posição — o mapa evita esse custo
      // repetido. A cada iteração ainda relemos a ORDEM atual direto do DOM
      // (consulta barata: só o atributo "widgetid", sem seletor aninhado),
      // para continuar refletindo o que o dijit realmente fez.
      const initialNodes = itemNodes(container);
      if (initialNodes.length < 2) continue;
      const labelByWidgetId = new Map<string, string>();
      for (const node of initialNodes) {
        const widgetId = node.getAttribute('widgetid') || '';
        labelByWidgetId.set(widgetId, labelOf(node));
      }
      const widgetIdsOf = (nodes: HTMLElement[]) => nodes.map((node) => node.getAttribute('widgetid') || '');
      const labelsFromIds = (widgetIds: string[]) => widgetIds.map((id) => labelByWidgetId.get(id) || '');

      const initialIds = widgetIdsOf(initialNodes);
      const initial = labelsFromIds(initialIds);
      if (isSorted(initial)) continue;
      const probe = await focus(initialNodes[0]);
      if (!probe || !probe.down) {
        summaries.push({ label: initial[0], skipped: true });
        continue;
      }
      // Margem generosa: o número de movimentos de 1 posição necessários no
      // pior caso (lista totalmente invertida) é no máximo n*(n-1)/2; usar
      // n*n (e tolerar mais tentativas "ociosas" antes de desistir) evita
      // falsos "stuck" causados por pequenas variações de timing do dijit.
      const max = initial.length * initial.length;
      let clicks = 0;
      let idle = 0;
      let error: string | null = null;
      while (clicks <= max) {
        if (!isTabStillActive(controllingTab)) return { ok: false, error: 'tab-changed', summaries };

        const currentNodes = itemNodes(container);
        const currentIds = widgetIdsOf(currentNodes);
        const labels = labelsFromIds(currentIds);
        if (isSorted(labels)) break;
        const move = nextMove(labels);
        if (!move) break;
        const direction = move.to < move.from ? 'up' : 'down';
        const node = currentNodes[move.from];
        const beforeIds = currentIds.join('\n');

        const result = await step(node, direction);
        if (result !== 'moved') {
          error = result;
          break;
        }
        clicks++;
        const afterIds = widgetIdsOf(itemNodes(container)).join('\n');
        if (afterIds === beforeIds) {
          idle++;
          if (idle > 4) {
            error = 'stuck';
            break;
          }
        } else {
          idle = 0;
        }
      }
      const finalLabels = labelsFromIds(widgetIdsOf(itemNodes(container)));
      summaries.push({ label: initial[0], clicks, error, sorted: isSorted(finalLabels) });
    }

    if (!isTabStillActive(controllingTab)) return { ok: false, error: 'tab-changed', summaries };

    return { ok: true, summaries };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'OPEN_PROCESSCENTER') {
    if (sender.tab && typeof sender.tab.index === 'number') {
      chrome.tabs.create({
        url: message.url,
        active: false,
        index: sender.tab.index,
      });
    } else {
      chrome.tabs.create({ url: message.url, active: false });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'TREE_SORT' || !sender.tab || typeof sender.tab.id !== 'number') return;
  chrome.scripting
    .executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN' as chrome.scripting.ExecutionWorld,
      func: sortActionableTree,
      args: [message.treeWidgetId],
    })
    .then((results) => {
      sendResponse((results[0] && results[0].result) || { ok: false, error: 'empty' });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
  return true;
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.url.includes('bpm.ibmcloud.com/auth/index.jsp')) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['injectLoginRedirect.js'],
    });
  }
});
