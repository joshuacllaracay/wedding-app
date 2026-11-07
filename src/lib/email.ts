import { Resend } from 'resend';
import { db } from './server';
import { invitationLink } from './invitation-link';
import { guestConfirmationEmail } from './guest-email';

// A guest address that keeps bouncing must not keep the couple's retry bar busy forever.
const GUEST_EMAIL_MAX_ATTEMPTS = 3;

// A durable outbox allows notification retries without resubmitting the RSVP.
// Each job sends two emails (couple + guest), tracked separately so retries never duplicate.
export async function deliverNotification(id: string): Promise<boolean> {
  const store = db();
  const { data: job, error } = await store.rpc('claim_notification', { p_id: id });
  if (error || !job) return false;
  try {
    const recipients = (import.meta.env.RSVP_EMAIL_TO ?? '').split(',').map((item: string) => item.trim()).filter(Boolean);
    if (!import.meta.env.RESEND_API_KEY || !import.meta.env.RSVP_EMAIL_FROM || !recipients.length) throw new Error('Email not configured');
    const { data: row, error: rowError } = await store.from('notification_outbox').select('invitation_id,attempts,couple_sent_at,guest_sent_at').eq('id', id).single();
    if (rowError) throw rowError;
    const payload = job.payload;
    const resend = new Resend(import.meta.env.RESEND_API_KEY);
    const now = () => new Date().toISOString();

    let coupleSent = !!row.couple_sent_at;
    if (!coupleSent) {
      const { error: sendError } = await resend.emails.send({
        from: import.meta.env.RSVP_EMAIL_FROM,
        to: recipients,
        replyTo: payload.email,
        subject: `Wedding RSVP: ${payload.attending ? 'Attending' : 'Unable to attend'} — ${payload.name.replace(/[\r\n]/g, ' ')}`,
        text: [
          `Invitation: ${payload.household}`,
          `From: ${payload.name}`,
          `Email: ${payload.email}`,
          `Response: ${payload.attending ? 'Attending' : 'Unable to attend'}`,
          `Guests attending: ${payload.guests}`,
          ...(payload.attending_names ? [`Names attending: ${payload.attending_names.join(', ') || 'None'}`] : []),
          '', 'Message:', payload.message,
          '', 'This response is saved in your private wedding guest dashboard.',
        ].join('\n'),
      }, { idempotencyKey: `rsvp-${id}` });
      if (!sendError) {
        coupleSent = true;
        await store.from('notification_outbox').update({ couple_sent_at: now() }).eq('id', id);
      }
    }

    let guestDone = !!row.guest_sent_at;
    // Resend's shared test sender (onboarding@resend.dev) only delivers to your own Resend
    // account address. Until a domain is verified, skip guest emails instead of failing them,
    // except to the couple's own addresses so the guest email can still be previewed.
    const testSender = /@resend\.dev>?\s*$/i.test(import.meta.env.RSVP_EMAIL_FROM);
    if (!guestDone && testSender && !recipients.some((r: string) => r.toLowerCase() === String(payload.email).trim().toLowerCase())) guestDone = true;
    if (!guestDone) {
      const { data: invite } = await store.from('invitations').select('token,code').eq('id', row.invitation_id).maybeSingle();
      // No invitation (deleted since) means there is nothing to confirm.
      if (!invite) guestDone = true;
      else {
        const email = guestConfirmationEmail({ name: payload.name, attending: payload.attending, attendingNames: payload.attending_names, message: payload.message, link: invitationLink(invite.token), code: invite.code });
        const { error: sendError } = await resend.emails.send({
          from: import.meta.env.RSVP_EMAIL_FROM,
          to: [payload.email],
          // Guest replies go to the couple.
          replyTo: recipients,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }, { idempotencyKey: `rsvp-guest-${id}` });
        if (!sendError) {
          guestDone = true;
          await store.from('notification_outbox').update({ guest_sent_at: now() }).eq('id', id);
        } else if (row.attempts >= GUEST_EMAIL_MAX_ATTEMPTS) guestDone = true; // give up on this guest address
      }
    }

    const finished = coupleSent && guestDone;
    const { error: updateError } = await store.from('notification_outbox').update(finished
      ? { status: 'sent', sent_at: now(), locked_at: null }
      : { status: 'failed', locked_at: null }).eq('id', id);
    return finished && !updateError;
  } catch {
    await store.from('notification_outbox').update({ status: 'failed', locked_at: null }).eq('id', id);
    return false;
  }
}
