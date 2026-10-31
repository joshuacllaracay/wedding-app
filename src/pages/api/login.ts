import type { APIRoute } from 'astro';
import { authClient, failure, json, readJson } from '../../lib/server';
import { InputError, textField } from '../../lib/validation';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies, url }) => {
  try {
    const body = await readJson(request);
    const email = textField(body.email, 'your email', 254);
    const password = textField(body.password, 'your password', 256);
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    const allowed = (import.meta.env.ADMIN_USER_IDS ?? '').split(',').map((id: string) => id.trim());
    if (error || !data.session || !allowed.includes(data.user.id)) throw new InputError('Unable to sign in with these details.', 401);
    cookies.set('wedding_session', data.session.access_token, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'strict', path: '/', maxAge: data.session.expires_in });
    return json({ success: true });
  } catch (error) { return failure(error); }
};
