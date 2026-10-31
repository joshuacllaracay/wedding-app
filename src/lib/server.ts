import { createClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';
import { InputError } from './validation';

export function configured() {
  return !!(import.meta.env.SUPABASE_URL && import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function db() {
  if (!configured()) throw new InputError('RSVP is not available yet. Please check back soon.', 503);
  return createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function authClient() {
  if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) throw new InputError('Admin sign-in has not been configured.', 503);
  return createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireAdmin(context: Pick<APIContext, 'cookies'>) {
  const token = context.cookies.get('wedding_session')?.value;
  if (!token) throw new InputError('Please sign in to continue.', 401);
  const { data, error } = await authClient().auth.getUser(token);
  const allowed = (import.meta.env.ADMIN_USER_IDS ?? '').split(',').map((id: string) => id.trim()).filter(Boolean);
  if (error || !data.user || !allowed.includes(data.user.id)) throw new InputError('Your session has expired or access is not allowed.', 401);
  return data.user;
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new InputError('Please submit this form from the invitation website.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Expected a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Missing request body.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 12_000) { await reader.cancel(); throw new InputError('This response is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new InputError('Unable to read this form.'); }
}
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export function failure(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message }, error.status);
  console.error('Wedding service request failed.');
  return json({ error: 'Something went wrong. Please try again shortly.' }, 500);
}
