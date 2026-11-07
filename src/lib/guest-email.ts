import { wedding } from '../config/wedding';

// The confirmation a guest receives after submitting or changing their RSVP.
// Keep it basic for now — edit the wording here to add more details later.
export type GuestEmailInput = {
  name: string;
  attending: boolean;
  attendingNames?: string[];
  message: string;
  link: string;
  code?: string | null;
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

export function guestConfirmationEmail(input: GuestEmailInput) {
  const couple = `${wedding.bride} & ${wedding.groom}`;
  const name = oneLine(input.name);
  const names = input.attendingNames?.filter(Boolean) ?? [];
  const subject = input.attending
    ? `Your RSVP is confirmed — ${couple}`
    : `We received your RSVP — ${couple}`;
  const lines = [
    `Hi ${name},`,
    '',
    input.attending
      ? `Thank you for your RSVP! We're so happy you'll be celebrating with us.`
      : `Thank you for letting us know. We're sorry you can't make it, and we'll miss you.`,
    '',
    `Your response: ${input.attending ? 'Attending' : 'Unable to attend'}`,
    ...(input.attending && names.length ? [`Attending: ${names.join(', ')}`] : []),
    '',
    'Your message to us:',
    input.message,
    '',
    'Need to change your response? Open your invitation:',
    input.link,
    ...(input.code ? [`Or enter your invitation code ${input.code} on our website.`] : []),
    '',
    `With love,`,
    couple,
  ];
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#493b32;max-width:520px">
<p>Hi ${escapeHtml(name)},</p>
<p>${input.attending
    ? 'Thank you for your RSVP! We’re so happy you’ll be celebrating with us.'
    : 'Thank you for letting us know. We’re sorry you can’t make it, and we’ll miss you.'}</p>
<p><strong>Your response:</strong> ${input.attending ? 'Attending' : 'Unable to attend'}${input.attending && names.length ? `<br><strong>Attending:</strong> ${escapeHtml(names.join(', '))}` : ''}</p>
<p><strong>Your message to us:</strong><br>${escapeHtml(input.message).replace(/\r?\n/g, '<br>')}</p>
<p>Need to change your response? <a href="${escapeHtml(input.link)}" style="color:#9d735c">Open your invitation</a>${input.code ? ` or enter your invitation code <strong>${escapeHtml(input.code)}</strong> on our website` : ''}.</p>
<p>With love,<br>${escapeHtml(couple)}</p>
</div>`;
  return { subject, text, html };
}
