import { MAX_PHOTO_BYTES, PHOTO_MIMES } from '../lib/memories';
type Photo = { id:string;guest_id:string;filename:string;status:string;expires_at:string };
type Status = { open:boolean;household:string;guests:{id:string;name:string}[];photos:Photo[] };
type Upload = { file:File; id:string; preview:string; uploadUrl?:string; uploaded?:boolean; saved?:boolean; label:HTMLElement };
const $ = <T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const token = new URLSearchParams(location.search).get('invite') ?? '';
const message = $('#memory-status');
const guestSelect = $<HTMLSelectElement>('#upload-guest');
const fileInput = $<HTMLInputElement>('#photo-files');
const send = $<HTMLButtonElement>('#upload-submit');
let state:Status|undefined, queue:Upload[] = [], busy = false;
$<HTMLAnchorElement>('#back-to-invitation').href = `/?invite=${encodeURIComponent(token)}`;
async function api(data:Record<string,unknown>) {
  const response = await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,token})});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Please try again.'); return result;
}
function tell(error:unknown) { message.textContent = error instanceof Error ? error.message : 'Unable to complete the upload. Please try again.'; }
function render() {
  if (!state) return;
  $('#upload-panel').hidden = !state.open; $('#memory-closed').hidden = state.open;
  const photos = state.photos.filter(p=>p.guest_id===guestSelect.value);
  const ready = photos.filter(p=>p.status==='ready');
  $('#photo-allowance').textContent = `${ready.length} of 10 photos shared · ${Math.max(0,10-photos.length)} slots available`;
  $('#uploaded-photos').replaceChildren(...ready.map(p=>{const li=document.createElement('li');li.textContent=`✓ ${p.filename}`;return li;}));
  if (!ready.length) { const li=document.createElement('li');li.textContent='Your shared photos will be listed here.';$('#uploaded-photos').append(li); }
  const pending = photos.filter(p=>p.status!=='ready');
  $('#pending-uploads').hidden = !pending.length;
  $('#pending-copy').textContent = `${pending.length} unfinished upload${pending.length===1?'':'s'} reserve photo slots. If the transfer finished, use the button below. If it was interrupted, retry your selected files. The couple can release expired slots after about 2¼ hours.`;
  send.disabled = busy || !queue.some(item=>!item.saved);
}
async function refresh() {
  state = await api({action:'status'});
  const selected=guestSelect.value;
  guestSelect.replaceChildren(...state!.guests.map(g=>{ const option=document.createElement('option');option.value=g.id;option.textContent=g.name;return option; }));
  if (state!.guests.some(g=>g.id===selected)) guestSelect.value=selected;
  render();
}
function clearQueue() { queue.forEach(item=>URL.revokeObjectURL(item.preview));queue=[];$('#upload-previews').replaceChildren();fileInput.value=''; }
guestSelect.addEventListener('change',()=>{ clearQueue();render(); });
fileInput.addEventListener('change',()=>{
  const files=[...(fileInput.files ?? [])];
  const remaining=10-(state?.photos.filter(p=>p.guest_id===guestSelect.value).length ?? 0);
  if (files.length>remaining) { message.textContent=`Choose up to ${remaining} more photos for this person.`;fileInput.value='';return; }
  if (files.some(f=>!PHOTO_MIMES.includes(f.type)||f.size<1||f.size>MAX_PHOTO_BYTES)) {message.textContent='Choose JPG, PNG, or WebP files, each 10 MB or smaller.';fileInput.value='';return;}
  clearQueue();message.textContent='';
  queue=files.map(file=>{
    const card=document.createElement('div');card.className='upload-preview';
    const preview=URL.createObjectURL(file);const image=document.createElement('img');image.src=preview;image.alt=file.name;
    const name=document.createElement('p');name.textContent=file.name;const label=document.createElement('small');label.textContent='Ready to share';card.append(image,name,label);$('#upload-previews').append(card);
    return {file,preview,id:crypto.randomUUID(),label};
  }); render();
});
function lock(value:boolean) { busy=value;guestSelect.disabled=value;fileInput.disabled=value;send.disabled=value;$<HTMLButtonElement>('#finish-pending').disabled=value; }
$('#photo-form').addEventListener('submit',async event=>{
  event.preventDefault(); if (busy) return;lock(true);message.textContent='Keep this page open while your photos upload.';
  for (const item of queue.filter(item=>!item.saved)) {
    try {
      item.label.textContent='Preparing…';
      if (!item.uploadUrl && !item.uploaded) {
        const ticket=await api({action:'reserve',id:item.id,guestId:guestSelect.value,filename:item.file.name,mimeType:item.file.type,byteSize:item.file.size});
        if (ticket.saved) {item.saved=true;item.label.textContent='Shared with love';continue;}
        item.uploadUrl=ticket.uploadUrl;
      }
      if (!item.uploaded) {
        item.label.textContent='Uploading…';
        const result=await fetch(item.uploadUrl!,{method:'PUT',headers:{'Content-Type':item.file.type,'x-upsert':'false'},body:item.file});
        // A lost success response may leave an existing immutable object. Finish validates it.
        if (!result.ok && result.status!==400 && result.status!==409) throw new Error('Photo transfer interrupted. Tap Share photos to retry.');
        item.uploaded=true;
      }
      item.label.textContent='Saving your memory…';await api({action:'finish',id:item.id});
      item.saved=true;item.label.textContent='Shared with love';
    } catch(error) { item.label.textContent=error instanceof Error?error.message:'Upload interrupted.';item.uploaded=false; }
  }
  const count=queue.filter(item=>item.saved).length;
  message.textContent=count===queue.length?'Your memories are saved. Thank you for sharing our day!':`${count} of ${queue.length} selected photos saved. Review the messages below and retry any unfinished photos.`;
  lock(false);try {await refresh();} catch(error) {tell(error);}
});
$('#finish-pending').addEventListener('click',async()=>{
  if (busy||!state) return;lock(true);let completed=0;
  const pending=state.photos.filter(p=>p.guest_id===guestSelect.value&&p.status==='pending');
  for (const photo of pending) {try{await api({action:'finish',id:photo.id});completed++;}catch{/* Keep other pending uploads recoverable. */}}
  message.textContent=`${completed} pending photos saved. Any remaining uploads need their original files retried, or expired slots released by the couple.`;
  lock(false);try{await refresh();}catch(error){tell(error);}
});
if (!token) message.textContent='Please open this page through your private wedding invitation link.';
else void refresh().then(()=>{message.textContent='';}).catch(tell);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy&&token)void refresh().catch(tell);});
window.addEventListener('beforeunload',event=>{if(busy)event.preventDefault();});
