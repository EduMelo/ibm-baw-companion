const SORT_BUTTON_ATTR = 'data-baw-sort-az';

const MOVE_ICON = {
  up: '.actionableTreeItem.upButton, .actionableTreeItem.upButtonDisabled',
  down: '.actionableTreeItem.downButton, .actionableTreeItem.downButtonDisabled',
};

function isHtmlElement(node: Element | null): node is HTMLElement {
  return !!node && node.nodeType === Node.ELEMENT_NODE;
}

function moveIcon(scope: ParentNode, direction: 'up' | 'down'): HTMLElement | null {
  const icon = scope.querySelector(MOVE_ICON[direction]);
  return isHtmlElement(icon) ? icon : null;
}

function controlOf(start: Element): HTMLElement | null {
  let node = start.parentElement;
  while (node) {
    if (moveIcon(node, 'up') && moveIcon(node, 'down') && node.querySelector('.dijitTree')) return node;
    node = node.parentElement;
  }
  return null;
}

function sortTree(tree: HTMLElement): Promise<{ ok: boolean; error?: string }> {
  const treeWidgetId = tree.getAttribute('widgetid');
  if (!treeWidgetId) return Promise.resolve({ ok: false, error: 'missing-tree' });
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'TREE_SORT', treeWidgetId }, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(result || { ok: false, error: 'empty' });
    });
  });
}

async function sortFromButton(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) return;
  const control = controlOf(button);
  const tree = control?.querySelector('.dijitTree');
  if (!control || !isHtmlElement(tree)) {
    console.warn('BAW Companion: lista de itens não encontrada ao lado dos botões.');
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = '...';
  try {
    const result = await sortTree(tree);
    if (!result.ok) console.warn('BAW Companion: falha ao ordenar.', result.error);
  } catch (error) {
    console.warn('BAW Companion: falha ao ordenar.', error);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function bindSortButton(button: HTMLButtonElement): void {
  const marked = button as HTMLButtonElement & { __bawBound?: boolean };
  if (marked.__bawBound) return;
  marked.__bawBound = true;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void sortFromButton(button);
  });
}

function installSortButtons(root: ParentNode): void {
  for (const icon of Array.from(root.querySelectorAll(MOVE_ICON.down)).filter(isHtmlElement)) {
    const control = controlOf(icon);
    const row = icon.closest('tr');
    if (!control || !row) continue;

    const existing = control.querySelector(`[${SORT_BUTTON_ATTR}]`);
    if (existing instanceof HTMLButtonElement || (isHtmlElement(existing) && existing.tagName === 'BUTTON')) {
      bindSortButton(existing as HTMLButtonElement);
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(SORT_BUTTON_ATTR, '');
    button.textContent = 'A–Z';
    button.title = 'Ordenar itens alfabeticamente';
    button.style.cssText = [
      'margin:4px 0',
      'width:100%',
      'min-width:20px',
      'padding:2px 0',
      'font:11px/1.2 sans-serif',
      'cursor:pointer',
      'border:1px solid #8d8d8d',
      'background:#f4f4f4',
      'color:#161616',
    ].join(';');
    bindSortButton(button);

    const td = document.createElement('td');
    td.appendChild(button);
    const tr = document.createElement('tr');
    tr.appendChild(td);
    row.insertAdjacentElement('afterend', tr);
  }
}

function bootSortButtons(): void {
  if (!location.href.includes('/WebPD/')) return;
  if (!document.body) return;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      installSortButtons(document);
    }, 200);
  };

  installSortButtons(document);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
}

bootSortButtons();
