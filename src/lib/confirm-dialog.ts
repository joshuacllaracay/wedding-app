// Styled, centered replacement for window.confirm(). Resolves true only on the confirm button.
type ConfirmOptions = {
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

let dialog: HTMLDialogElement | null = null;

function build() {
  const node = document.createElement('dialog');
  node.className = 'confirm-dialog';
  node.innerHTML = `
    <div class="confirm-dialog-body">
      
      <h2 class="confirm-dialog-title"></h2>
      <p class="confirm-dialog-message"></p>
      <ul class="confirm-dialog-details"></ul>
    </div>
    <div class="confirm-dialog-actions">
      <button type="button" class="confirm-dialog-cancel"></button>
      <button type="button" class="confirm-dialog-confirm"></button>
    </div>`;
  document.body.append(node);
  return node;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  dialog ??= build();
  const node = dialog;
  const titleId = 'confirm-dialog-title';
  node.setAttribute('aria-labelledby', titleId);
  node.dataset.tone = options.tone ?? 'default';
  const title = node.querySelector<HTMLElement>('.confirm-dialog-title')!;
  title.id = titleId; title.textContent = options.title;
  node.querySelector('.confirm-dialog-message')!.textContent = options.message;
  const list = node.querySelector<HTMLUListElement>('.confirm-dialog-details')!;
  list.replaceChildren(...(options.details ?? []).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  list.hidden = !options.details?.length;
  const confirm = node.querySelector<HTMLButtonElement>('.confirm-dialog-confirm')!;
  const cancel = node.querySelector<HTMLButtonElement>('.confirm-dialog-cancel')!;
  confirm.textContent = options.confirmLabel ?? 'Confirm';
  cancel.textContent = options.cancelLabel ?? 'Cancel';

  return new Promise(resolve => {
    const finish = (value: boolean) => {
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      node.removeEventListener('cancel', onEscape);
      node.removeEventListener('click', onBackdrop);
      node.classList.remove('is-open');
      node.close();
      resolve(value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onEscape = (event: Event) => { event.preventDefault(); finish(false); };
    // Clicking the dimmed backdrop (outside the panel) cancels.
    const onBackdrop = (event: MouseEvent) => {
      const box = node.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) finish(false);
    };
    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    node.addEventListener('cancel', onEscape);
    node.addEventListener('click', onBackdrop);
    node.showModal();
    requestAnimationFrame(() => node.classList.add('is-open'));
    // Safer default focus for destructive actions.
    (options.tone === 'danger' ? cancel : confirm).focus();
  });
}
