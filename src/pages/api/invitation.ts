import type { APIRoute } from 'astro';
import { db, failure, json, readJson } from '../../lib/server';
import { InputError, isUuid } from '../../lib/validation';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson(request);
    if (!isUuid(body.token)) throw new InputError('Please enter the invitation code from your private link.');
    const store = db();
    const { data, error } = await store.from('invitations').select('id, household, max_guests').eq('token', body.token).maybeSingle();
    if (error) throw error;
    if (!data) throw new InputError('We could not find that invitation. Please check your code.', 404);
    const { data: response, error: responseError } = await store.from('responses').select('name,email,attending,guests,message').eq('invitation_id', data.id).maybeSingle();
    if (responseError) throw responseError;
    return json({ household: data.household, maxGuests: data.max_guests, response });
  } catch (error) { return failure(error); }
};
