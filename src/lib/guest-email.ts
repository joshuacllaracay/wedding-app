import { wedding } from '../config/wedding';

// The confirmation a guest receives after submitting or changing their RSVP.
// Edit the wording below. The HTML uses tables and inline styles on purpose:
// that is what email apps (Gmail, Outlook, Apple Mail) display reliably.
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

// Palette matching the website.
const C = { page: '#f3ece3', card: '#fdfaf6', line: '#e6dbcd', ink: '#493b32', muted: '#7b6b60', accent: '#9d735c', soft: '#f6efe6' };
const serif = "Georgia,'Times New Roman',serif";
const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export function guestConfirmationEmail(input: GuestEmailInput) {
  const couple = `${wedding.bride} & ${wedding.groom}`;
  const siteUrl = wedding.invitationSiteUrl;
  const siteHost = new URL(siteUrl).host;
  const name = oneLine(input.name);
  const code = input.code ?? '';

  const subject = input.attending ? `Your RSVP is confirmed — ${couple}` : `We received your RSVP — ${couple}`;
  const heading = input.attending ? 'Your RSVP is confirmed' : 'Thank you for letting us know';
  const thanks = input.attending
    ? `Thank you for confirming your RSVP, ${name}. We’re so happy you’ll be celebrating with us.`
    : `Thank you for your RSVP, ${name}. We’re sorry you can’t make it, and we’ll miss you dearly.`;
  const details = [wedding.date, wedding.venue].filter(Boolean).join(' · ');

  const text = [
    `${couple.toUpperCase()}`,
    '',
    heading,
    '',
    thanks,
    '',
    `Need to change your response? Open your invitation${code ? ` or enter your invitation code ${code} on our website` : ''}:`,
    input.link,
    '',
    'With love,',
    couple,
    '',
    details,
    siteHost,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(thanks)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:36px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};">
    <tr><td style="padding:8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};">
        <tr><td align="center" style="padding:46px 34px 8px;">
          <p style="margin:0;font-family:${sans};font-size:10px;letter-spacing:4px;color:${C.muted};text-transform:uppercase;">${escapeHtml(couple)}</p>
          <p style="margin:18px 0 0;font-family:${serif};font-size:40px;line-height:1;color:${C.ink};">${escapeHtml(wedding.bride.charAt(0))}<span style="font-style:italic;color:${C.accent};font-size:30px;padding:0 6px;">&amp;</span>${escapeHtml(wedding.groom.charAt(0))}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;"><tr>
            <td style="width:48px;border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding:0 10px;font-family:${serif};font-size:14px;color:${C.accent};line-height:1;">&#10023;</td>
            <td style="width:48px;border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:22px 40px 0;">
          <h1 style="margin:0;font-family:${serif};font-weight:normal;font-size:30px;line-height:1.2;color:${C.ink};">${escapeHtml(heading)}</h1>
          <p style="margin:18px 0 0;font-family:${sans};font-size:15px;line-height:1.75;color:${C.muted};">${escapeHtml(thanks)}</p>
        </td></tr>
        <tr><td align="center" style="padding:32px 40px 0;">
          <p style="margin:0;font-family:${sans};font-size:14px;line-height:1.75;color:${C.muted};">Need to change your response? <a href="${escapeHtml(input.link)}" style="color:${C.accent};text-decoration:underline;">Open your invitation</a>${code ? ' or enter your invitation code on our website.' : '.'}</p>
          ${code ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;"><tr><td align="center" style="padding:14px 28px;background:${C.soft};border:1px solid ${C.line};">
            <p style="margin:0;font-family:${sans};font-size:9px;letter-spacing:3px;color:${C.muted};text-transform:uppercase;">Your invitation code</p>
            <p style="margin:8px 0 0;font-family:${sans};font-size:24px;font-weight:bold;letter-spacing:7px;color:${C.ink};padding-left:7px;">${escapeHtml(code)}</p>
          </td></tr></table>` : ''}
        </td></tr>
        <tr><td align="center" style="padding:38px 40px 46px;">
          <p style="margin:0;font-family:${serif};font-style:italic;font-size:17px;color:${C.muted};">With love,</p>
          <p style="margin:6px 0 0;font-family:${serif};font-size:24px;color:${C.ink};">${escapeHtml(wedding.bride)} <span style="font-style:italic;color:${C.accent};">&amp;</span> ${escapeHtml(wedding.groom)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <p style="margin:20px 0 0;font-family:${sans};font-size:11px;letter-spacing:1px;color:${C.muted};">${escapeHtml(details)}</p>
  <p style="margin:6px 0 0;font-family:${sans};font-size:11px;"><a href="${escapeHtml(siteUrl)}" style="color:${C.accent};text-decoration:none;">${escapeHtml(siteHost)}</a></p>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}
