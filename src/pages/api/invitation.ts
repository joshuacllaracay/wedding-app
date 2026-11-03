import type { APIRoute } from 'astro';
import { db, failure, json, readJson } from '../../lib/server';
import { InputError, isUuid } from '../../lib/validation';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJson(request);
    if (!isUuid(body.token)) throw new InputError('Please enter the invitation code from your private link.');
    const store = db();
    const { data, error } = await store.from('invitations').select('id, household, max_guests,invitation_guests(id,name,position,attending)').eq('token', body.token).is('removed_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new InputError('We could not find that invitation. Please check your code.', 404);
    const { data: response, error: responseError } = await store.from('responses').select('name,email,attending,guests,message').eq('invitation_id', data.id).maybeSingle();
    if (responseError) throw responseError;
    const { data: memoriesOpen, error: memoriesError } = await store.rpc('memories_are_open');
    if (memoriesError) throw memoriesError;
    return json({ household: data.household, maxGuests: data.max_guests, guests: data.invitation_guests.sort((a,b)=>a.position-b.position), response, memoriesOpen: !!memoriesOpen });
  } catch (error) { return failure(error); }
};
