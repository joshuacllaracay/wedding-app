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
  }, reducedMotion ? 0 : 2850); // flap + letter (1.3s), heart sketch (to 2.5s), short hold, then a 0.65s fade = 3.5s
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
const countField = $('#guest-count-field');
const selectedGuests = () => [...form.querySelectorAll<HTMLInputElement>('input[name="guestIds"]:checked')].map(input=>input.value);
function renderGuestChoices(guests: {id:string;name:string;attending:boolean|null}[]) {
  const container = $('#named-guests'); container.replaceChildren();
  for (const guest of guests) {
    const label = document.createElement('label'); const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'guestIds'; input.value = guest.id; input.checked = guest.attending === true;
    const name = document.createElement('span'); name.textContent = guest.name;
    label.append(input,name); container.append(label);
  }
}
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
  form.querySelectorAll<HTMLInputElement>('input[name="guestIds"]').forEach(input => { input.disabled = !attending; });
  $('#message-label').textContent = new FormData(form).get('attending') === 'no' ? 'A message or reason you cannot attend' : 'A little message for the couple';
}
form.querySelectorAll('input[name="attending"]').forEach(input => input.addEventListener('change', attendanceChanged));
async function loadInvitation(code: string) {
  const button = lookupForm.querySelector<HTMLButtonElement>('button')!;
  button.disabled = true;
  setStatus('Finding your invitation…', true);
  try {
    // Accept a pasted full link as well as a 6-character code or the long private code.
    let entered = code.trim();
    try { entered = new URL(entered).searchParams.get('invite') ?? entered; } catch { /* not a URL */ }
    const data = await api('/api/invitation', { token: entered });
    token = data.token;
    // Keep the private link in the address bar so refreshing keeps working.
    const url = new URL(location.href); url.searchParams.set('invite', token); history.replaceState(null, '', url);
    $('#household-name').textContent = data.household;
    $('#guest-allowance').textContent = `(up to ${data.maxGuests})`;
    renderGuestChoices(data.guests);
    if (data.response) {
      for (const field of ['name', 'email', 'message'] as const) (form.elements.namedItem(field) as HTMLInputElement).value = data.response[field];
      const radio = form.querySelector<HTMLInputElement>(`input[value="${data.response.attending ? 'yes' : 'no'}"]`)!;
      radio.checked = true;
      $('#submit-rsvp').firstChild!.textContent = 'Update with love ';
    }
    attendanceChanged();
    lookup.hidden = true; form.hidden = false; setStatus('');
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load your invitation.'); }
  finally { button.disabled = false; }
}
lookupForm.addEventListener('submit', event => { event.preventDefault(); void loadInvitation($<HTMLInputElement>('#invite-code').value); });
if (token) { $<HTMLInputElement>('#invite-code').value = token; void loadInvitation(token); }
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = $<HTMLButtonElement>('#submit-rsvp');
  const values = new FormData(form);
  const attending = values.get('attending') === 'yes';
  const guestIds = attending ? selectedGuests() : [];
  if (attending && !guestIds.length) { setStatus('Please select the names of the guests attending.'); return; }
  button.disabled = true; setStatus('Sending your response…', true);
  try {
    await api('/api/rsvp', { token, name: values.get('name'), email: values.get('email'), attending, guestIds, message: values.get('message'), website: values.get('website') });
    form.hidden = true; success.hidden = false;
    $('#success-copy').textContent = attending ? `We have saved your response for ${guestIds.length} ${guestIds.length === 1 ? 'person' : 'people'}. We cannot wait to celebrate with you. A confirmation is on its way to your email.` : 'Thank you for letting us know. You will be with us in spirit, and your message means so much. A confirmation is on its way to your email.';
    $('#submit-rsvp').firstChild!.textContent = 'Update with love ';
    setStatus('');
    success.setAttribute('tabindex', '-1'); success.focus({ preventScroll: true });
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to send your response. Please try again.'); }
  finally { button.disabled = false; }
});
$('#edit-rsvp').addEventListener('click', () => { form.hidden = false; success.hidden = true; $<HTMLInputElement>('#guest-name').focus(); });

