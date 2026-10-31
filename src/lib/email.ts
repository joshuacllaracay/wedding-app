import { Resend } from 'resend';
import { db } from './server';

// A durable outbox allows notification retries without resubmitting the RSVP.
export async function deliverNotification(id: string): Promise<boolean> {
  const store = db();
  const { data: job, error } = await store.rpc('claim_notification', { p_id: id });
  if (error || !job) return false;
  try {
    const recipients = (import.meta.env.RSVP_EMAIL_TO ?? '').split(',').map((item: string) => item.trim()).filter(Boolean);
    if (!import.meta.env.RESEND_API_KEY || !import.meta.env.RSVP_EMAIL_FROM || !recipients.length) throw new Error('Email not configured');
    const payload = job.payload;
    const { error: sendError } = await new Resend(import.meta.env.RESEND_API_KEY).emails.send({
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
    if (sendError) throw new Error('Email send failed');
    const { error: updateError } = await store.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), locked_at: null }).eq('id', id);
    return !updateError;
  } catch {
    await store.from('notification_outbox').update({ status: 'failed', locked_at: null }).eq('id', id);
    return false;
  }
}
