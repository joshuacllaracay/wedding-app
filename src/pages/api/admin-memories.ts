import type { APIRoute } from 'astro';
import { db, failure, json, readJson, requireAdmin } from '../../lib/server';
import { InputError, isUuid } from '../../lib/validation';
import { MEMORY_BUCKET, parseMemorySettings } from '../../lib/memories';
export const prerender = false;
export const GET: APIRoute = async context => {
  try {
    await requireAdmin(context);
    const store = db();
    const page = Number(context.url.searchParams.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 100000) throw new InputError('Invalid page.');
    const guest = context.url.searchParams.get('guest');
    if (guest && !isUuid(guest)) throw new InputError('Invalid guest.');
    let query = store.from('memory_photos').select('id,guest_id,filename,byte_size,completed_at,thumbnail_path,invitation_guests(name,invitation_id)', { count: 'exact' }).eq('status', 'ready').order('completed_at', { ascending: false }).order('id').range(page * 24, page * 24 + 23);
    if (guest) query = query.eq('guest_id', guest);
    const { data: photos, error, count } = await query;
    if (error) throw error;
    const { data: urls, error: urlError } = photos.length ? await store.storage.from(MEMORY_BUCKET).createSignedUrls(photos.map(p => p.thumbnail_path), 1800) : { data: [], error: null };
    if (urlError) throw urlError;
    const { data: settings, error: settingsError } = await store.from('memory_settings').select('*').eq('id',true).single();
    if (settingsError) throw settingsError;
    const { count: expired, error: expiredError } = await store.from('memory_photos').select('id', { count:'exact', head: true }).neq('status','ready').lt('expires_at', new Date(Date.now()-10*60_000).toISOString());
    if (expiredError) throw expiredError;
    return json({ photos: photos.map((p,i) => ({ ...p, thumbnailUrl: urls?.[i]?.signedUrl ?? null })), total: count ?? 0, page, settings, expired: expired ?? 0 });
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async context => {
  try {
    await requireAdmin(context);
    const body = await readJson(context.request);
    const store = db();
    if (body.action === 'settings') {
      const values = parseMemorySettings(body);
      const { error } = await store.from('memory_settings').update(values).eq('id',true);
      if (error) throw error;
      return json({ saved: true });
    }
    if (body.action === 'remove') {
      if (!isUuid(body.id)) throw new InputError('Invalid photo.');
      const { data: photo, error } = await store.rpc('remove_memory_photo', { p_id: body.id });
      if (error) throw error;
      if (!photo) return json({ removed: true });
      const { error: removeError } = await store.storage.from(MEMORY_BUCKET).remove([photo.original_path, photo.thumbnail_path]);
      // A Storage failure must not return the photo to the gallery. Cleanup can retry.
      return json({ removed: true, cleanupPending: !!removeError });
    }
    if (body.action === 'cleanup') {
      // Claim expired unfinished uploads before touching Storage. Ready photos never qualify.
      // Ten-minute grace also allows an in-flight finalization to finish before removal.
      const { data: expired, error } = await store.from('memory_photos').select('id').neq('status','ready').lt('expires_at',new Date(Date.now()-10*60_000).toISOString()).limit(50);
      if (error) throw error;
      if (!expired.length) return json({ released: 0 });
      const { data: claimed, error: claimError } = await store.from('memory_photos').update({ status:'cleaning' }).in('id',expired.map(p=>p.id)).neq('status','ready').select('id,original_path,thumbnail_path');
      if (claimError) throw claimError;
      const { error: removeError } = await store.storage.from(MEMORY_BUCKET).remove(claimed.flatMap(p => [p.original_path,p.thumbnail_path]));
      if (removeError) throw removeError;
      const { error: deleteError } = await store.from('memory_photos').delete().in('id',claimed.map(p=>p.id)).eq('status','cleaning');
      if (deleteError) throw deleteError;
      return json({ released: claimed.length });
    }
    if (body.action === 'download') {
      if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 10 || !body.ids.every(isUuid)) throw new InputError('Select between 1 and 10 photos.');
      const { data: photos, error } = await store.from('memory_photos').select('id,filename,original_path,byte_size,invitation_guests(name)').eq('status','ready').in('id',body.ids);
      if (error) throw error;
      if (photos.length !== new Set(body.ids).size) throw new InputError('One of these photos is no longer available.',404);
      const downloads = [];
      for (const photo of photos) {
        const { data, error: urlError } = await store.storage.from(MEMORY_BUCKET).createSignedUrl(photo.original_path, 300, body.view === true ? undefined : { download: photo.filename });
        if (urlError) throw urlError;
        downloads.push({ id:photo.id, filename:photo.filename, byteSize:photo.byte_size, url:data.signedUrl });
      }
      return json({ downloads });
    }
    throw new InputError('Unknown action.');
  } catch (error) { return failure(error); }
};
