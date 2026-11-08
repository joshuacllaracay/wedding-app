import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestConfirmationEmail } from '../src/lib/guest-email';

const base = { name: 'Alex', message: 'See you soon!', link: 'https://example.com/?invite=abc', code: 'K7MP3Q' };

test('attending guests get a short thank-you with their link and code', () => {
  const email = guestConfirmationEmail({ ...base, attending: true, attendingNames: ['Alex', 'Sam'] });
  assert.match(email.subject, /confirmed/);
  assert.match(email.text, /Thank you for confirming your RSVP, Alex\./);
  assert.match(email.text, /enter your invitation code K7MP3Q on our website/);
  assert.match(email.text, /https:\/\/example\.com\/\?invite=abc/);
  assert.match(email.html, /K7MP3Q/);
  // Response details and the guest's message are intentionally left out.
  assert.doesNotMatch(email.text, /Your response:|Attending:|Your message to us/);
  assert.doesNotMatch(email.html, /See you soon!/);
});

test('declining guests get a kind note', () => {
  const email = guestConfirmationEmail({ ...base, attending: false, attendingNames: [] });
  assert.match(email.subject, /received/);
  assert.match(email.text, /sorry you can’t make it/);
});

test('guest-written text is escaped in the HTML version', () => {
  const email = guestConfirmationEmail({ ...base, name: '<b>Eve</b>\nBcc: x', attending: true });
  assert.ok(!email.html.includes('<b>Eve</b>'));
  assert.ok(email.html.includes('&lt;b&gt;Eve&lt;/b&gt;'));
  assert.ok(!email.text.includes('\nBcc'));
});
