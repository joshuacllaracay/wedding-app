type Photo={id:string;guest_id:string;filename:string;byte_size:number;completed_at:string;thumbnailUrl:string|null;invitation_guests:{name:string}|{name:string}[]};
type Download={id:string;filename:string;byteSize:number;url:string};
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const status=$('#memories-admin-status');
const filter=$<HTMLSelectElement>('#gallery-guest');
const mode=$<HTMLSelectElement>('#memory-mode');
const selected=new Set<string>();let page=0,photos:Photo[]=[],current:Photo|undefined,settingsLoaded=false,loadingVersion=0,zipBusy=false;
const guestName=(p:Photo)=>Array.isArray(p.invitation_guests)?p.invitation_guests[0]?.name:p.invitation_guests?.name;
const tell=(error:unknown)=>{status.textContent=error instanceof Error?error.message:'Unable to complete this action.';};
async function api(data?:unknown) {
  const url=`/api/admin-memories?page=${page}&guest=${encodeURIComponent(filter.value)}`;
  const response=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:undefined);
  if(response.status===401){location.assign('/login');throw new Error('Please sign in again.');}
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
export function updateGuestFilter(guests:{id:string;name:string}[]) {
  const previous=filter.value;filter.replaceChildren(new Option('Everyone',''),...guests.sort((a,b)=>a.name.localeCompare(b.name)).map(g=>new Option(g.name,g.id)));
  filter.value=previous;
}
function updateSelection() {const button=$<HTMLButtonElement>('#download-selected');button.textContent=zipBusy?'Preparing ZIP…':`Download selected ZIP (${selected.size}/10)`;button.disabled=zipBusy||selected.size===0;}
function singaporeInput(value:string|null) {return value?new Date(Date.parse(value)+8*60*60*1000).toISOString().slice(0,16):'';}
function scheduleFields() {const scheduled=mode.value==='scheduled';$('#memory-schedule').hidden=!scheduled;$<HTMLInputElement>('#memory-opens').required=scheduled;$<HTMLInputElement>('#memory-closes').required=scheduled;}
async function downloadOne(photo:Photo) {
  const result=await api({action:'download',ids:[photo.id]});const item=result.downloads[0] as Download;
  const anchor=document.createElement('a');anchor.href=item.url;anchor.download=item.filename;anchor.rel='noreferrer';anchor.click();
}
async function removePhoto(photo:Photo, button:HTMLButtonElement) {
  if (!window.confirm(`Remove “${photo.filename}” shared by ${guestName(photo)}? It will disappear from the gallery and its original and thumbnail will be deleted. This cannot be undone.`)) return;
  button.disabled=true;
  try {
    const result=await api({action:'remove',id:photo.id});
    selected.delete(photo.id);
    if(current?.id===photo.id){current=undefined;$<HTMLDialogElement>('#photo-viewer').close();$<HTMLImageElement>('#photo-viewer-image').removeAttribute('src');}
    await load();
    status.textContent=result.cleanupPending?'Photo removed from the gallery. File cleanup needs a retry; use Release expired slots once it becomes available.':'Photo removed from the gallery.';
  }catch(error){tell(error);}finally{button.disabled=false;}
}
function renderGallery() {
  const grid=$('#gallery-grid');grid.replaceChildren();
  for(const photo of photos){
    const card=document.createElement('article');card.className='memory-photo-card';
    const view=document.createElement('button');view.type='button';view.className='memory-photo-view';view.setAttribute('aria-label',`View ${photo.filename} by ${guestName(photo)}`);
    const img=document.createElement('img');if(photo.thumbnailUrl)img.src=photo.thumbnailUrl;img.alt=photo.filename;img.loading='lazy';view.append(img);
    view.addEventListener('click',async()=>{current=photo;const image=$<HTMLImageElement>('#photo-viewer-image');image.src=photo.thumbnailUrl??'';image.alt=photo.filename;$('#photo-viewer-caption').textContent=`${guestName(photo)} · ${photo.filename}`;$<HTMLDialogElement>('#photo-viewer').showModal();try{const result=await api({action:'download',ids:[photo.id],view:true});if(current?.id===photo.id)image.src=result.downloads[0].url;}catch(error){tell(error);}});
    const caption=document.createElement('div');caption.className='memory-photo-caption';const name=document.createElement('strong');name.textContent=guestName(photo);const filename=document.createElement('small');filename.textContent=photo.filename;
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(photo.id);const text=document.createElement('span');text.textContent='Select for ZIP';label.append(check,text);
    check.addEventListener('change',()=>{if(check.checked&&selected.size>=10){check.checked=false;status.textContent='Select up to 10 photos per ZIP.';return;}if(check.checked)selected.add(photo.id);else selected.delete(photo.id);updateSelection();});
    const download=document.createElement('button');download.className='text-link';download.textContent='Download original ↓';download.addEventListener('click',()=>{void downloadOne(photo).catch(tell);});
    const remove=document.createElement('button');remove.type='button';remove.className='text-link danger-link';remove.textContent='Remove photo';remove.setAttribute('aria-label',`Remove ${photo.filename} by ${guestName(photo)}`);remove.addEventListener('click',()=>{void removePhoto(photo,remove);});
    const actions=document.createElement('div');actions.className='photo-actions';actions.append(download,remove);
    caption.append(name,filename,label,actions);card.append(view,caption);grid.append(card);
  }
  $('#gallery-empty').hidden=photos.length>0;updateSelection();
}
async function load() {
  const version=++loadingVersion;status.textContent='Loading your memories…';
  try{
    const data=await api();if(version!==loadingVersion)return;
    const lastPage=Math.max(0,Math.ceil(data.total/24)-1);if(page>lastPage){page=lastPage;await load();return;}
    photos=data.photos;
    $('#gallery-total').textContent=`${data.total} photo${data.total===1?'':'s'} shared${filter.value?' by this guest':''}`;
    $('#gallery-page').textContent=`Page ${page+1} of ${Math.max(1,Math.ceil(data.total/24))}`;
    $<HTMLButtonElement>('#gallery-prev').disabled=page===0;$<HTMLButtonElement>('#gallery-next').disabled=(page+1)*24>=data.total;
    $('#cleanup-panel').hidden=data.expired===0;$('#expired-photo-count').textContent=String(data.expired);
    if(!settingsLoaded){mode.value=data.settings.mode;$<HTMLInputElement>('#memory-opens').value=singaporeInput(data.settings.opens_at);$<HTMLInputElement>('#memory-closes').value=singaporeInput(data.settings.closes_at);scheduleFields();settingsLoaded=true;}
    renderGallery();status.textContent='';
  }catch(error){if(version===loadingVersion)tell(error);}
}
mode.addEventListener('change',scheduleFields);
$('#memory-settings-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$<HTMLButtonElement>('#memory-settings-form button');button.disabled=true;
  try{const start=$<HTMLInputElement>('#memory-opens').value,end=$<HTMLInputElement>('#memory-closes').value;
    await api({action:'settings',mode:mode.value,opensAt:start?`${start}:00+08:00`:null,closesAt:end?`${end}:00+08:00`:null});
    status.textContent='Photo-sharing settings saved. Invitations will show the button while sharing is open.';
  }catch(error){tell(error);}finally{button.disabled=false;}
});
$('#cleanup-photos').addEventListener('click',async()=>{
  const button=$<HTMLButtonElement>('#cleanup-photos');button.disabled=true;
  try{const result=await api({action:'cleanup'});await load();status.textContent=`${result.released} expired upload slots released. Completed memories are kept.`;}catch(error){tell(error);}finally{button.disabled=false;}
});
filter.addEventListener('change',()=>{page=0;selected.clear();void load();});
$('#gallery-refresh').addEventListener('click',()=>{void load();});
$('#gallery-prev').addEventListener('click',()=>{if(page>0){page--;void load();}});
$('#gallery-next').addEventListener('click',()=>{page++;void load();});
$('#close-photo-viewer').addEventListener('click',()=>$<HTMLDialogElement>('#photo-viewer').close());
$('#photo-viewer-download').addEventListener('click',()=>{if(current)void downloadOne(current).catch(tell);});
$('#photo-viewer-remove').addEventListener('click',()=>{if(current)void removePhoto(current,$<HTMLButtonElement>('#photo-viewer-remove'));});
$('#download-selected').addEventListener('click',async()=>{
  if(zipBusy)return;zipBusy=true;updateSelection();
  try{
    const result=await api({action:'download',ids:[...selected]});
    const {zipSync}=await import('fflate');const files:Record<string,Uint8Array>={};let done=0;
    for(const item of result.downloads as Download[]){status.textContent=`Preparing original ${++done} of ${result.downloads.length}…`;const response=await fetch(item.url);if(!response.ok)throw new Error('A download failed. Please try the ZIP again.');files[`${item.id.slice(0,8)}-${item.filename.replace(/[^a-z0-9._-]/gi,'_')}`]=new Uint8Array(await response.arrayBuffer());}
    const zip=zipSync(files,{level:0});const url=URL.createObjectURL(new Blob([new Uint8Array(zip).buffer],{type:'application/zip'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`wedding-memories-${Date.now()}.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
    selected.clear();renderGallery();status.textContent='Your ZIP is ready. The originals remain safely in your gallery.';
  }catch(error){tell(error);}finally{zipBusy=false;updateSelection();}
});
void load();
