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
  const siteHost = new URL(wedding.invitationSiteUrl).host;
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
    ...(input.code ? [`Your invitation code: ${input.code}`, ''] : []),
    'Need to change your response? Open your invitation:',
    input.link,
    ...(input.code ? [`Or go to ${siteHost} and enter your code ${input.code}.`] : []),
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
${input.code ? `<p style="margin:22px 0;padding:14px 18px;background:#f3ece3;border:1px solid #e2d6c8;text-align:center"><span style="display:block;font-size:11px;letter-spacing:2px;color:#7b6b60">YOUR INVITATION CODE</span><strong style="display:block;font-size:24px;letter-spacing:6px;color:#493b32;margin-top:6px">${escapeHtml(input.code)}</strong></p>` : ''}
<p>Need to change your response? <a href="${escapeHtml(input.link)}" style="color:#9d735c">Open your invitation</a>${input.code ? ` or go to ${escapeHtml(siteHost)} and enter your code` : ''}.</p>
<p>With love,<br>${escapeHtml(couple)}</p>
</div>`;
  return { subject, text, html };
}
