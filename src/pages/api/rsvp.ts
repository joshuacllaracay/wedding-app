import type { APIRoute } from 'astro';
import { wedding } from '../../config/wedding';
import { db, failure, json, readJson } from '../../lib/server';
import { InputError, parseNamedRsvp } from '../../lib/validation';
import { deliverNotification } from '../../lib/email';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = parseNamedRsvp(await readJson(request));
    if (wedding.rsvpClosesAt && Date.now() > Date.parse(wedding.rsvpClosesAt)) throw new InputError('The RSVP deadline has passed. Please contact the couple directly.', 403);
    const { data, error } = await db().rpc('submit_named_rsvp', { p_token: body.token, p_name: body.name, p_email: body.email, p_attending: body.attending, p_guest_ids: body.guestIds, p_message: body.message });
    if (error) {
      if (error.message.includes('INVITATION_NOT_FOUND')) throw new InputError('Please check your invitation code.', 404);
      if (error.message.includes('GUEST_LIMIT')) throw new InputError('Your guest count exceeds your invitation allowance.');
      if (error.message.includes('GUEST_NOT_FOUND')) throw new InputError('Please choose names from your invitation.');
      if (error.message.includes('PLEASE_WAIT')) throw new InputError('Please wait a few seconds before updating your response.', 429);
      throw error;
    }
    if (data.notification_id) await deliverNotification(data.notification_id);
    return json({ saved: true });
  } catch (error) { return failure(error); }
};
