import { InputError, textField } from './validation';

export const MEMORY_BUCKET = 'wedding-memories';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export function parsePhoto(value: Record<string, unknown>) {
  const filename = textField(value.filename, 'a filename', 180).replace(/[\r\n\x00]/g, '');
  if (typeof value.mimeType !== 'string' || !PHOTO_MIMES.includes(value.mimeType)) throw new InputError('Choose JPG, PNG, or WebP photos. Export HEIC photos as JPG first.');
  if (!Number.isInteger(value.byteSize) || (value.byteSize as number) < 1 || (value.byteSize as number) > MAX_PHOTO_BYTES) throw new InputError('Each photo must be 10 MB or smaller.');
  return { filename, mimeType: value.mimeType, byteSize: value.byteSize as number };
}
export function parseMemorySettings(value: Record<string, unknown>) {
  if (!['closed', 'open', 'scheduled'].includes(String(value.mode))) throw new InputError('Choose closed, open, or scheduled uploads.');
  const parseDate = (input: unknown) => {
    if (input === '' || input === null || input === undefined) return null;
    if (typeof input !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(input) || !Number.isFinite(Date.parse(input))) throw new InputError('Choose a valid date and time.');
    return new Date(input).toISOString();
  };
  const opens_at = parseDate(value.opensAt), closes_at = parseDate(value.closesAt);
  if (value.mode === 'scheduled' && (!opens_at || !closes_at || opens_at >= closes_at)) throw new InputError('The upload closing time must be after the opening time.');
  return { mode: String(value.mode), opens_at, closes_at };
}
export function memoryError(error: { message?: string } | null) {
  if (!error) return;
  const messages: Record<string, [string, number]> = {
    UPLOADS_CLOSED: ['Photo sharing is currently closed. Please check back during the celebration.', 403],
    PHOTO_LIMIT: ['All 10 photo slots are used or reserved. Finish your pending uploads or ask the couple to release expired ones.', 409],
    GUEST_NOT_FOUND: ['This guest does not belong to your invitation. Please reopen your private link.', 404],
    UPLOAD_EXPIRED: ['This upload has expired. Please ask the couple to release the expired slot.', 409],
    INVALID_UPLOAD: ['This upload does not match the selected photo.', 400],
  };
  for (const [code, [message, status]] of Object.entries(messages)) if (error.message?.includes(code)) throw new InputError(message, status);
  throw error;
}
