import QRCode from 'qrcode';
import { csvCell } from '../lib/validation';
import { updateGuestFilter } from './admin-memories';
type Rsvp = { name: string; email: string; attending: boolean; guests: number; message: string; updated_at: string };
type Invitation = { id: string; token: string; household: string; max_guests: number; created_at: string; invitation_guests:{id:string;name:string;position:number;attending:boolean|null}[]; responses: Rsvp | Rsvp[] | null };
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let invitations: Invitation[] = [];
let loaded = false;
let editingId: string | null = null;
const status = $('#dashboard-status');
const responseFor = (invitation: Invitation) => Array.isArray(invitation.responses) ? invitation.responses[0] : invitation.responses;
const linkFor = (invitation: Pick<Invitation, 'token'>) => `${location.origin}/?invite=${invitation.token}`;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
};
async function request(data?: unknown) {
  const response = await fetch('/api/admin', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : undefined);
  if (response.status === 401) { location.assign('/login'); throw new Error('Please sign in again.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const showError = (error: unknown) => { status.textContent = error instanceof Error ? error.message : 'Unable to complete this action.'; };
function render() {
  const rows = $('#guest-list'); rows.replaceChildren();
  const search = $<HTMLInputElement>('#search').value.toLowerCase().trim();
  const filtered = invitations.filter(invite => { const rsvp = responseFor(invite); return `${invite.household} ${invite.invitation_guests.map(g=>g.name).join(' ')} ${rsvp?.name ?? ''} ${rsvp?.email ?? ''}`.toLowerCase().includes(search); });
  const responses = invitations.map(responseFor).filter((response): response is Rsvp => !!response);
  $('#total-guests').textContent = String(responses.reduce((sum, response) => sum + response.guests, 0));
  $('#total-accepting').textContent = String(responses.filter(response => response.attending).length);
  $('#total-declined').textContent = String(responses.filter(response => !response.attending).length);
  $('#total-waiting').textContent = String(invitations.length - responses.length);
  for (const invite of filtered) {
    const rsvp = responseFor(invite);
    const row = element('tr');
    const name = element('td'); name.append(element('strong', invite.household), element('small', `Allowance: ${invite.max_guests} ${invite.max_guests === 1 ? 'person' : 'people'}`));
    for (const guest of invite.invitation_guests.sort((a,b)=>a.position-b.position)) name.append(element('small', `${guest.name}${guest.attending===true?' · attending':guest.attending===false?' · not attending':''}`));
    const attendance = element('td'); const badge = element('span', rsvp ? rsvp.attending ? 'Attending' : 'Declined' : 'Awaiting reply'); badge.className = `badge ${rsvp ? rsvp.attending ? 'accepted' : 'declined' : ''}`; attendance.append(badge);
    const count = element('td', rsvp ? String(rsvp.guests) : '—');
    const details = element('td');
    if (rsvp) {
      const message = element('p', rsvp.message); message.className = 'message';
      details.append(element('span', rsvp.name), element('small', rsvp.email), message, element('small', new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(rsvp.updated_at))));
    } else details.textContent = '—';
    const sharing = element('td'); const actions = element('div'); actions.className = 'row-actions';
    const copy = element('button', 'Copy link');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(linkFor(invite)); status.textContent = `Invitation link copied for ${invite.household}.`; }
      catch { showCreatedLink(linkFor(invite)); status.textContent = 'Select and copy the invitation link above.'; }
    });
    const qr = element('button', 'QR code ↓');
    qr.addEventListener('click', async () => {
      try {
        const url = await QRCode.toDataURL(linkFor(invite), { width: 900, margin: 4, color: { dark: '#493b32', light: '#ffffff' }, errorCorrectionLevel: 'M' });
        const download = element('a'); download.href = url; download.download = `invitation-${invite.household.replace(/[^a-z0-9]/gi, '-').slice(0,60)}.png`; download.click();
      } catch (error) { showError(error); }
    });
    const rotate = element('button', 'Replace link');
    rotate.addEventListener('click', async () => {
      if (!window.confirm(`Replace the private link for ${invite.household}? Their old link and QR code will stop working. Their RSVP will be kept.`)) return;
      rotate.disabled = true;
      try { await request({ action: 'rotate', id: invite.id }); await load(); status.textContent = 'Private link replaced. Share a new link or QR code with this guest.'; }
      catch (error) { showError(error); rotate.disabled = false; }
    });
    const edit = element('button','Edit names'); edit.addEventListener('click',()=>{
      editingId=invite.id;$<HTMLInputElement>('#household').value=invite.household;
      $<HTMLSelectElement>('#max-guests').value=String(invite.max_guests);$<HTMLSelectElement>('#max-guests').disabled=true;
      $<HTMLInputElement>('#first-guest').value=invite.invitation_guests[0]?.name??'';
      $<HTMLInputElement>('#second-guest').value=invite.invitation_guests[1]?.name??'';
      updateGuestFields();$('#create-invitation-submit').textContent='Save guest names';$('#cancel-edit').hidden=false;
      $<HTMLInputElement>('#first-guest').focus();$('#create-invitation').scrollIntoView({behavior:'smooth',block:'center'});
    });
    actions.append(copy, qr, edit, rotate); sharing.append(actions); row.append(name, attendance, count, details, sharing); rows.append(row);
  }
  $('#guest-list-empty').hidden = filtered.length > 0;
  $('#guest-list-empty').textContent = search ? 'No guests match your search.' : 'No invitations yet. Create your first one above.';
}
function showCreatedLink(link: string) { $('#created-invitation').hidden = false; $<HTMLInputElement>('#created-link').value = link; }
async function load() {
  status.textContent = 'Loading your guest list…';
  try {
    const result = await request(); invitations = result.invitations; loaded = true;
    updateGuestFilter(invitations.flatMap(invite=>invite.invitation_guests));
    $('#notification-bar').hidden = result.pendingEmails === 0;
    $('#pending-emails').textContent = String(result.pendingEmails);
    render(); status.textContent = '';
  } catch (error) { showError(error); }
}
$('#search').addEventListener('input', () => { if (loaded) render(); });
$('#refresh').addEventListener('click', () => { void load(); });
const createForm = $<HTMLFormElement>('#create-invitation');
function updateGuestFields() { const pair=$<HTMLSelectElement>('#max-guests').value==='2';$('#second-guest-field').hidden=!pair;$<HTMLInputElement>('#second-guest').required=pair; }
function resetEditor() { editingId=null;createForm.reset();$<HTMLSelectElement>('#max-guests').disabled=false;$('#create-invitation-submit').textContent='Create invitation +';$('#cancel-edit').hidden=true;updateGuestFields(); }
$('#max-guests').addEventListener('change',updateGuestFields);$('#cancel-edit').addEventListener('click',resetEditor);
createForm.addEventListener('submit', async event => {
  event.preventDefault(); const button = createForm.querySelector<HTMLButtonElement>('button')!;
  const values = new FormData(createForm); button.disabled = true;
  try {
    const names=[String(values.get('firstGuest')??'').trim()];if($<HTMLSelectElement>('#max-guests').value==='2')names.push(String(values.get('secondGuest')??'').trim());
    const household=String(values.get('household')??'').trim()||names.join(' & ').slice(0,120);
    const result=await request({action:editingId?'rename':'create',id:editingId,household,names});
    if(!editingId)showCreatedLink(linkFor(result));resetEditor();await load();
  }
  catch (error) { showError(error); }
  finally { button.disabled = false; }
});
$('#retry-emails').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('#retry-emails'); button.disabled = true;
  try { const result = await request({ action: 'retry' }); await load(); status.textContent = `${result.sent} notifications sent. Any remaining notifications are saved for another retry.`; }
  catch (error) { showError(error); }
  finally { button.disabled = false; }
});
$('#export').addEventListener('click', () => {
  if (!loaded) { status.textContent = 'Please load the guest list before exporting.'; return; }
  const header = ['Invitation', 'Named guests', 'Names attending', 'Allowance', 'Response', 'People attending', 'Respondent', 'Email', 'Message', 'Updated at'];
  const records = invitations.map(invite => { const r = responseFor(invite); return [invite.household,invite.invitation_guests.map(g=>g.name).join('; '),invite.invitation_guests.filter(g=>g.attending).map(g=>g.name).join('; '), invite.max_guests, r ? r.attending ? 'Attending' : 'Declined' : 'Awaiting response', r?.guests ?? '', r?.name, r?.email, r?.message, r?.updated_at]; });
  const csv = '\uFEFF' + [header, ...records].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const download = element('a'); download.href = url; download.download = 'chyka-emmanuel-guest-list.csv'; download.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#logout').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Unable to sign out. Please try again.');
    location.assign('/login');
  } catch (error) { showError(error); }
});
void load();
