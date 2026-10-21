chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('reopenProcessCenterEnabled', (data) => {
    if (data.reopenProcessCenterEnabled === undefined) {
      chrome.storage.sync.set({ reopenProcessCenterEnabled: true });
    }
  });
});

function sortActionableTree(treeWidgetId: string) {
  const dijitApi = (window as any).dijit;
  try {
    const tree = dijitApi.byId(treeWidgetId);
    if (!tree || !tree.domNode) return { ok: false, error: 'missing-tree' };
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
    const labelsOf = (container: Element) => itemNodes(container).map(labelOf);
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
    const focus = (node: HTMLElement) => {
      const widget = dijitApi.byId(node.getAttribute('widgetid'));
      if (!widget) return null;
      action.setSelection(widget.item);
      const selected = tree.getNodesByItem(tree.selectedItem)[0];
      if (!selected || selected.id !== widget.id) return null;
      return {
        up: !!action._handler.isUpEnabled(tree.selectedItem),
        down: !!action._handler.isDownEnabled(tree.selectedItem),
      };
    };
    const step = (node: HTMLElement, direction: 'up' | 'down') => {
      const state = focus(node);
      if (!state) return 'mismatch';
      if (direction === 'up' ? !state.up : !state.down) return 'disabled';
      if (direction === 'up') action._handleUpButtonPressed();
      else action._handleDownButtonPressed();
      return 'moved';
    };

    const summaries: Array<{ label: string; skipped?: boolean; clicks?: number; error?: string | null; sorted?: boolean }> = [];
    const containers = Array.from(tree.domNode.querySelectorAll('.dijitTreeNodeContainer')) as HTMLElement[];
    for (const container of containers) {
      const initial = labelsOf(container);
      if (initial.length < 2 || isSorted(initial)) continue;
      const probe = focus(itemNodes(container)[0]);
      if (!probe || !probe.down) {
        summaries.push({ label: initial[0], skipped: true });
        continue;
      }
      const max = initial.length * initial.length;
      let clicks = 0;
      let idle = 0;
      let error: string | null = null;
      while (clicks <= max) {
        const labels = labelsOf(container);
        if (isSorted(labels)) break;
        const move = nextMove(labels);
        if (!move) break;
        const direction = move.to < move.from ? 'up' : 'down';
        const node = itemNodes(container)[move.from];
        const before = labels.join('\n');
        const state = focus(node);
        if (!state) {
          error = 'mismatch';
          break;
        }
        const enabled = direction === 'up' ? state.up : state.down;
        if (!enabled) {
          error = 'disabled';
          break;
        }
        if (step(node, direction) !== 'moved') {
          error = 'move-failed';
          break;
        }
        clicks++;
        if (labelsOf(container).join('\n') === before) {
          idle++;
          if (idle > 2) {
            error = 'stuck';
            break;
          }
        } else {
          idle = 0;
        }
      }
      summaries.push({ label: initial[0], clicks, error, sorted: isSorted(labelsOf(container)) });
    }
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
