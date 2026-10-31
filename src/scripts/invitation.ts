export {};
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const envelope = $('#envelope-screen');
const main = $('#invitation');
const openButton = $<HTMLButtonElement>('#open-envelope');
const audio = document.querySelector<HTMLAudioElement>('#wedding-audio');
const music = document.querySelector<HTMLButtonElement>('#music-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
main.inert = true;
document.body.classList.add('envelope-active');
function updateMusic() {
  if (!audio || !music) return;
  music.setAttribute('aria-pressed', String(!audio.paused));
  music.setAttribute('aria-label', audio.paused ? 'Play music' : 'Pause music');
  $('#music-label').textContent = audio.paused ? 'Play music' : 'Pause music';
}
async function playMusic() { if (audio) { try { await audio.play(); } catch { /* The visible play control remains available. */ } updateMusic(); } }
openButton.addEventListener('click', () => {
  openButton.disabled = true;
  void playMusic(); // Call during the gesture; don't wait for the animation.
  envelope.classList.add('is-opening');
  window.setTimeout(() => {
    envelope.classList.add('is-open');
    main.inert = false;
    document.body.classList.remove('envelope-active');
    main.focus({ preventScroll: true });
    window.setTimeout(() => { envelope.hidden = true; }, reducedMotion ? 0 : 700);
  }, reducedMotion ? 0 : 1550);
}, { once: true });
music?.addEventListener('click', () => { if (!audio) return; if (audio.paused) void playMusic(); else { audio.pause(); updateMusic(); } });
audio?.addEventListener('pause', updateMusic);
audio?.addEventListener('play', updateMusic);
if (audio) audio.volume = 0.45;

const status = $('#form-status');
const lookup = $('#invitation-lookup');
const lookupForm = $<HTMLFormElement>('#lookup-form');
const form = $<HTMLFormElement>('#rsvp-form');
const success = $('#rsvp-success');
const count = $<HTMLSelectElement>('#guest-count');
const countField = $('#guest-count-field');
let token = new URLSearchParams(window.location.search).get('invite') ?? '';
const api = async (path: string, data: unknown) => {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to send your response. Please try again.');
  return result;
};
const setStatus = (message: string, loading = false) => { status.textContent = message; status.dataset.state = loading ? 'loading' : 'error'; };
function attendanceChanged() {
  const attending = new FormData(form).get('attending') === 'yes';
  countField.hidden = !attending;
  count.disabled = !attending;
  $('#message-label').textContent = new FormData(form).get('attending') === 'no' ? 'A message or reason you cannot attend' : 'A little message for the couple';
}
form.querySelectorAll('input[name="attending"]').forEach(input => input.addEventListener('change', attendanceChanged));
async function loadInvitation(code: string) {
  const button = lookupForm.querySelector<HTMLButtonElement>('button')!;
  button.disabled = true;
  setStatus('Finding your invitation…', true);
  try {
    const data = await api('/api/invitation', { token: code.trim() });
    token = code.trim();
    $('#household-name').textContent = data.household;
    $('#guest-allowance').textContent = `(up to ${data.maxGuests})`;
    count.options[1].hidden = data.maxGuests < 2;
    count.options[1].disabled = data.maxGuests < 2;
    count.value = '1';
    if (data.response) {
      for (const field of ['name', 'email', 'message'] as const) (form.elements.namedItem(field) as HTMLInputElement).value = data.response[field];
      const radio = form.querySelector<HTMLInputElement>(`input[value="${data.response.attending ? 'yes' : 'no'}"]`)!;
      radio.checked = true;
      count.value = String(data.response.guests || 1);
      $('#submit-rsvp').firstChild!.textContent = 'Update with love ';
    }
    attendanceChanged();
    lookup.hidden = true; form.hidden = false; setStatus('');
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load your invitation.'); }
  finally { button.disabled = false; }
}
lookupForm.addEventListener('submit', event => { event.preventDefault(); void loadInvitation($<HTMLInputElement>('#invite-code').value); });
if (token) { $<HTMLInputElement>('#invite-code').value = token; void loadInvitation(token); }
let previewOnly = false;
document.querySelector('#preview-form')?.addEventListener('click', () => {
  previewOnly = true; lookup.hidden = true; form.hidden = false;
  $('#household-name').textContent = 'Sample invitation';
  $('#guest-allowance').textContent = '(up to 2)';
  setStatus('Form preview only. Responses will not be saved or emailed.');
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (previewOnly) { setStatus('Form preview only. Connect Supabase and use a real invitation link to send an RSVP.'); return; }
  const button = $<HTMLButtonElement>('#submit-rsvp');
  const values = new FormData(form);
  const attending = values.get('attending') === 'yes';
  button.disabled = true; setStatus('Sending your response…', true);
  try {
    await api('/api/rsvp', { token, name: values.get('name'), email: values.get('email'), attending, guests: attending ? Number(values.get('guests')) : 0, message: values.get('message'), website: values.get('website') });
    form.hidden = true; success.hidden = false;
    $('#success-copy').textContent = attending ? `We have saved your response for ${count.value} ${count.value === '1' ? 'person' : 'people'}. We cannot wait to celebrate with you.` : 'Thank you for letting us know. You will be with us in spirit, and your message means so much.';
    $('#submit-rsvp').firstChild!.textContent = 'Update with love ';
    setStatus('');
    success.setAttribute('tabindex', '-1'); success.focus({ preventScroll: true });
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to send your response. Please try again.'); }
  finally { button.disabled = false; }
});
$('#edit-rsvp').addEventListener('click', () => { form.hidden = false; success.hidden = true; $<HTMLInputElement>('#guest-name').focus(); });
