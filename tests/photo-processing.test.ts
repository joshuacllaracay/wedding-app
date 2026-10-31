import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createPhotoThumbnail } from '../src/lib/photo-processing';

test('real images receive bounded WebP thumbnails without altering the original',async()=>{
  const original=await sharp({create:{width:1200,height:800,channels:3,background:'#dcc5b1'}}).jpeg().toBuffer();
  const copy=Buffer.from(original);
  const thumbnail=await createPhotoThumbnail(original,original.length,'image/jpeg');
  const meta=await sharp(thumbnail).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,720);assert.equal(meta.height,480);assert.deepEqual(original,copy);
});
test('validation rejects forged content types, wrong sizes, corrupt data and oversized dimensions',async()=>{
  const png=await sharp({create:{width:12,height:12,channels:3,background:'#ffffff'}}).png().toBuffer();
  await assert.rejects(createPhotoThumbnail(png,png.length,'image/jpeg'));
  await assert.rejects(createPhotoThumbnail(png,png.length+1,'image/png'));
  const invalid=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await assert.rejects(createPhotoThumbnail(invalid,invalid.length,'image/jpeg'));
  const oversized=await sharp({create:{width:6500,height:6500,channels:3,background:'#ffffff'}}).png().toBuffer();
  await assert.rejects(createPhotoThumbnail(oversized,oversized.length,'image/png'));
});
