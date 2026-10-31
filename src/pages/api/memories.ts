import type { APIRoute } from 'astro';
import { db, failure, json, readJson } from '../../lib/server';
import { InputError, isUuid } from '../../lib/validation';
import { MEMORY_BUCKET, memoryError, parsePhoto } from '../../lib/memories';
import { finishPhoto, invitationByToken } from '../../lib/memories-server';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson(request);
    const invite = await invitationByToken(body.token);
    const token = body.token as string;
    const store = db();
    if (body.action === 'status') {
      const { data: open, error: openError } = await store.rpc('memories_are_open'); memoryError(openError);
      const { data: photos, error } = await store.from('memory_photos').select('id,guest_id,filename,status,expires_at').in('guest_id', invite.invitation_guests.map(g => g.id)).order('created_at');
      if (error) throw error;
      return json({ open: !!open, household: invite.household, guests: invite.invitation_guests.sort((a,b) => a.position-b.position), photos });
    }
    if (body.action === 'finish') {
      if (!isUuid(body.id)) throw new InputError('Invalid photo.');
      await finishPhoto(token, body.id); return json({ saved: true });
    }
    if (body.action !== 'reserve' || !isUuid(body.guestId) || !isUuid(body.id)) throw new InputError('Invalid upload request.');
    const photo = parsePhoto(body);
    const { data, error } = await store.rpc('reserve_memory_photo', { p_token: token, p_guest: body.guestId, p_id: body.id, p_filename: photo.filename, p_mime: photo.mimeType, p_bytes: photo.byteSize });
    memoryError(error);
    if (data.status === 'ready') return json({ id: data.id, saved: true });
    // Never renew a ticket late: cleanup waits 125 minutes, longer than its 2h validity.
    if (data.status !== 'pending' || Date.now() - Date.parse(data.created_at) > 60_000) throw new InputError('This upload was already started. Use “Finish pending uploads” or retry with the original upload selection.', 409);
    const { data: ticket, error: ticketError } = await store.storage.from(MEMORY_BUCKET).createSignedUploadUrl(data.original_path, { upsert: false });
    if (ticketError) throw ticketError;
    return json({ id: data.id, uploadUrl: ticket.signedUrl });
  } catch (error) { return failure(error); }
};
