/**
 * Content script injetado nas páginas do Process Designer (WebPD) que adiciona
 * um botão "A–Z" ao lado das listas de itens ordenáveis (ex.: atributos de
 * entrada/saída de serviços) para ordená-los alfabeticamente.
 *
 * Ao ordenar, mantém um pop-up (toast) informando o progresso: aparece
 * dizendo que os atributos estão sendo ordenados, muda de cor e de texto
 * quando a ordenação termina, e some automaticamente após alguns segundos.
 *
 * Tudo fica dentro de uma IIFE para não vazar identificadores para o escopo
 * global compartilhado com os demais content scripts (tsconfig usa
 * "module": "None").
 */
(function bawSortTreeItems() {
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

  function ensureSortToastContainer(): HTMLElement {
    let container = document.querySelector('.baw-sort-toast-container') as HTMLElement | null;
    if (!container) {
      container = document.createElement('div');
      container.className = 'baw-sort-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Cria um toast persistente para acompanhar a ordenação em andamento.
   * Retorna funções para atualizar seu texto/cor (ex.: ao concluir) e para
   * agendar o desaparecimento automático alguns segundos depois.
   */
  function showSortingToast(message: string): {
    update: (message: string, kind: 'success' | 'error') => void;
    dismissAfter: (ms: number) => void;
  } {
    const container = ensureSortToastContainer();
    const toast = document.createElement('div');
    toast.className = 'baw-sort-toast info';
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('baw-visible'));

    return {
      update(nextMessage, kind) {
        toast.textContent = nextMessage;
        toast.classList.remove('info', 'success', 'error');
        toast.classList.add(kind);
      },
      dismissAfter(ms) {
        window.setTimeout(() => {
          toast.classList.remove('baw-visible');
          window.setTimeout(() => toast.remove(), 250);
        }, ms);
      },
    };
  }

  /** Traduz os códigos de erro retornados pelo background em mensagens amigáveis. */
  function describeSortError(errorCode: unknown): string {
    if (errorCode === 'tab-changed') return 'Ordenação interrompida: você saiu da aba durante o processo.';
    return 'Falha ao ordenar os atributos.';
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

    const toast = showSortingToast('Ordenando atributos...');
    try {
      const result = await sortTree(tree);
      if (result.ok) {
        toast.update('Ordenação finalizada!', 'success');
      } else {
        console.warn('BAW Companion: falha ao ordenar.', result.error);
        toast.update(describeSortError(result.error), 'error');
      }
    } catch (error) {
      console.warn('BAW Companion: falha ao ordenar.', error);
      toast.update('Falha ao ordenar os atributos.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = previousText;
      toast.dismissAfter(3000);
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

  // Recurso experimental: opt-in, desativado por padrão. Só liga os botões
  // "A–Z" se o usuário tiver habilitado explicitamente na página de opções.
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get({ sortTreeItemsEnabled: false }, (data) => {
      if (data.sortTreeItemsEnabled) bootSortButtons();
    });
  } else {
    console.warn('BAW Companion: API do Chrome não disponível neste contexto (ordenação de atributos).');
  }
})();
