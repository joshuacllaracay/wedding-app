import sharp from 'sharp';
import { MAX_PHOTO_BYTES } from './memories';

export async function createPhotoThumbnail(bytes: Buffer, expectedSize: number, expectedMime: string): Promise<Buffer> {
  if (bytes.length > MAX_PHOTO_BYTES || bytes.length !== expectedSize) throw new Error('Photo size does not match its reservation.');
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format as string];
  if (mime !== expectedMime || (metadata.pages ?? 1) > 1) throw new Error('Unsupported photo format.');
  return image.rotate().resize(720, 720, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
}
