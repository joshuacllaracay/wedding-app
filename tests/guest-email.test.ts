import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestConfirmationEmail } from '../src/lib/guest-email';

const base = { name: 'Alex', message: 'See you <there>!', link: 'https://example.com/?invite=abc', code: '4821' };
test('attending guests get a confirmation with names, link and code', () => {
  const email = guestConfirmationEmail({ ...base, attending: true, attendingNames: ['Alex', 'Sam'] });
  assert.match(email.subject, /confirmed/);
  assert.match(email.text, /Attending: Alex, Sam/);
  assert.match(email.text, /https:\/\/example\.com\/\?invite=abc/);
  assert.match(email.text, /4821/);
});
test('declining guests get a kind note without an attending list', () => {
  const email = guestConfirmationEmail({ ...base, attending: false, attendingNames: [] });
  assert.match(email.text, /Unable to attend/);
  assert.doesNotMatch(email.text, /Attending:/);
});
test('guest-written text is escaped in the HTML version', () => {
  const email = guestConfirmationEmail({ ...base, name: '<b>Eve</b>\nBcc: x', attending: true });
  assert.ok(!email.html.includes('<b>Eve</b>'));
  assert.ok(email.html.includes('&lt;there&gt;'));
  assert.ok(!email.text.includes('\nBcc'));
});
