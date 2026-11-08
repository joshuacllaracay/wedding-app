import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationLink } from '../src/lib/invitation-link';
import { wedding } from '../src/config/wedding';

test('shared invitations use the public domain even from a protected admin deployment', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://wedding-private-preview.vercel.app' } });
  try {
    const token = '26b39d80-25a7-4618-9d0d-21c586a2da25';
    const url = new URL(invitationLink(token));
    assert.equal(url.origin, new URL(wedding.invitationSiteUrl).origin);
    assert.equal(url.origin, 'https://www.chykaandemmanuel.com');
    assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('invite'), token);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test('upload links open the photo page, with the guest code filled in when given', async () => {
  const { uploadLink } = await import('../src/lib/invitation-link');
  const general = new URL(uploadLink());
  assert.equal(general.origin, new URL(wedding.invitationSiteUrl).origin);
  assert.equal(general.pathname, '/upload');
  assert.equal(general.search, '');
  const personal = new URL(uploadLink('K7MP3Q'));
  assert.equal(personal.pathname, '/upload');
  assert.equal(personal.searchParams.get('code'), 'K7MP3Q');
});
