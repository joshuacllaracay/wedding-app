import { createPhotoThumbnail } from './photo-processing';
import { db } from './server';
import { InputError, isUuid } from './validation';
import { MAX_PHOTO_BYTES, MEMORY_BUCKET, memoryError } from './memories';

export async function invitationByToken(token: unknown) {
  if (!isUuid(token)) throw new InputError('Please open your private invitation link.', 400);
  const store = db();
  const { data, error } = await store.from('invitations').select('id,household,invitation_guests(id,name,position,attending)').eq('token', token).maybeSingle();
  if (error) throw error;
  if (!data) throw new InputError('This invitation was not found. Please ask the couple for your latest link.', 404);
  return data;
}
export async function finishPhoto(token: string, id: string) {
  const invite = await invitationByToken(token);
  const store = db();
  const { data: photo, error } = await store.from('memory_photos').select('*').eq('id', id).in('guest_id', invite.invitation_guests.map(g => g.id)).maybeSingle();
  if (error) throw error;
  if (!photo) throw new InputError('Photo not found for this invitation.', 404);
  if (photo.status === 'ready') return;
  const { data: open, error: openError } = await store.rpc('memories_are_open'); memoryError(openError);
  if (!open) throw new InputError('Photo sharing is currently closed.', 403);
  if (photo.status !== 'pending' || Date.parse(photo.expires_at) < Date.now()) throw new InputError('This upload has expired or was rejected. Ask the couple to release the slot after it expires.', 409);
  const bucket = store.storage.from(MEMORY_BUCKET);
  const { data: original, error: downloadError } = await bucket.download(photo.original_path);
  if (downloadError || !original) throw new InputError('The photo has not finished uploading. Retry the upload, then finish it again.', 409);
  let thumbnail: Buffer;
  try {
    if (original.size > MAX_PHOTO_BYTES || original.size !== photo.byte_size) throw new Error('size');
    const bytes = Buffer.from(await original.arrayBuffer());
    thumbnail = await createPhotoThumbnail(bytes, photo.byte_size, photo.mime_type);
  } catch {
    await store.from('memory_photos').update({ status: 'rejected' }).eq('id', id).eq('status', 'pending');
    throw new InputError('This file could not be read as a still photo. Use JPG, PNG, or WebP, up to 10 MB and 40 megapixels.', 400);
  }
  const { error: thumbError } = await bucket.upload(photo.thumbnail_path, thumbnail, { contentType: 'image/webp', upsert: true });
  if (thumbError) throw thumbError;
  const { error: completeError } = await store.rpc('complete_memory_photo', { p_token: token, p_id: id });
  memoryError(completeError);
}
