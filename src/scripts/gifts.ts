export {};
// Gift section: tapping the card opens a dialog with the couple's real QR codes (GCash and
// GoTyme Bank), one at a time with tabs. The dialog closes with its button, Escape or a tap outside.
const open = document.querySelector<HTMLButtonElement>('#gift-reveal');
const dialog = document.querySelector<HTMLDialogElement>('#gift-dialog');

if (open && dialog) {
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panes = [...dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const select = (i: number, focus = false) => {
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    panes.forEach((p, k) => { p.hidden = k !== i; });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true); }
    });
  });
  select(0);

  open.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });
  // (The page behind stops scrolling while the dialog is open — handled in CSS with :has().)
  dialog.addEventListener('close', () => open.focus());
  dialog.querySelector<HTMLButtonElement>('#gift-close')?.addEventListener('click', () => dialog.close());
  // A tap on the dimmed area outside the panel closes it.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}
