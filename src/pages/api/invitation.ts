import type { APIRoute } from 'astro';
import { db, failure, json, readJson } from '../../lib/server';
import { InputError, isUuid, normalizeInvitationCode } from '../../lib/validation';
export const prerender = false;
async function clientKey(request: Request, clientAddress: string | undefined) {
  // On Vercel, x-forwarded-for is set by the platform to the visitor's IP.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wedding-code:${ip || 'unknown'}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    const body = await readJson(request);
    const store = db();
    let token = body.token;
    const code = normalizeInvitationCode(body.token);
    if (code) {
      let address: string | undefined;
      try { address = context.clientAddress; } catch { address = undefined; }
      const { data: found, error: codeError } = await store.rpc('lookup_invitation_code', { p_code: code, p_client: await clientKey(request, address) });
      if (codeError?.message?.includes('TOO_MANY_ATTEMPTS')) throw new InputError('Too many incorrect codes. Please wait 15 minutes, or open the private link the couple sent you.', 429);
      if (codeError) throw codeError;
      if (!found) throw new InputError('We could not find that invitation. Please check your 6-character code.', 404);
      token = found;
    }
    if (!isUuid(token)) throw new InputError('Please enter your 6-character invitation code, or open your private link.');
    const { data, error } = await store.from('invitations').select('id, household, max_guests,invitation_guests(id,name,position,attending)').eq('token', token).is('removed_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new InputError('We could not find that invitation. Please check your code.', 404);
    const { data: response, error: responseError } = await store.from('responses').select('name,email,attending,guests,message').eq('invitation_id', data.id).maybeSingle();
    if (responseError) throw responseError;
    const { data: memoriesOpen, error: memoriesError } = await store.rpc('memories_are_open');
    if (memoriesError) throw memoriesError;
    return json({ token, household: data.household, maxGuests: data.max_guests, guests: data.invitation_guests.sort((a,b)=>a.position-b.position), response, memoriesOpen: !!memoriesOpen });
  } catch (error) { return failure(error); }
};
