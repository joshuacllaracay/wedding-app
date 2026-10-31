import type { APIRoute } from 'astro';
import { failure, json, readJson } from '../../lib/server';
export const prerender = false;
export const POST: APIRoute = async ({ cookies, request }) => {
  try { await readJson(request); cookies.delete('wedding_session', { path: '/' }); return json({ success: true }); }
  catch (error) { return failure(error); }
};
