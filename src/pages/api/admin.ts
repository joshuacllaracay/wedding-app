import type { APIRoute } from 'astro';
import { db, failure, json, readJson, requireAdmin } from '../../lib/server';
import { InputError, isUuid, textField, parseGuestNames } from '../../lib/validation';
import { deliverNotification } from '../../lib/email';
import { MEMORY_BUCKET } from '../../lib/memories';
export const prerender = false;

const MAX_BULK_REMOVE = 100;
// Permanently deletes one invitation (guests, RSVP, emails, photo rows) and its photo files.
async function removeInvitation(store: ReturnType<typeof db>, id: string) {
  const { data, error } = await store.rpc('delete_invitation', { p_id: id });
  if (error?.code === 'PGRST202') throw new InputError('Invitation removal needs a database update. Run supabase/migrations/004_hard_delete_invitation.sql in the Supabase SQL editor, then try again.', 503);
  if (error) throw error;
  if (!data) return { photosDeleted: 0, cleanupPending: false };
  const { guest_ids: guestIds, paths } = data as { guest_ids: string[]; paths: string[] };
  // Also sweep each guest's folders so uploads without a finished DB row are removed too.
  const bucket = store.storage.from(MEMORY_BUCKET);
  const files = new Set(paths);
  for (const guest of guestIds) for (const folder of ['originals', 'thumbnails']) {
    const { data: listed } = await bucket.list(`${folder}/${guest}`, { limit: 1000 });
    for (const file of listed ?? []) files.add(`${folder}/${guest}/${file.name}`);
  }
  let cleanupPending = false;
  const all = [...files];
  for (let i = 0; i < all.length; i += 100) {
    const { error: removeError } = await bucket.remove(all.slice(i, i + 100));
    if (removeError) cleanupPending = true;
  }
  return { photosDeleted: paths.length / 2, cleanupPending };
}
export const GET: APIRoute = async (context) => {
  try {
    await requireAdmin(context);
    const store = db();
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await store.from('invitations').select('id,token,code,household,max_guests,created_at,invitation_guests(id,name,position,attending),responses(name,email,attending,guests,message,updated_at)').is('removed_at', null).order('created_at').order('id').range(start, start + 499);
      if (error?.code === '42703') throw new InputError('Invitation codes need a database update. Run supabase/migrations/005_invitation_codes.sql in the Supabase SQL editor, then refresh.', 503);
      if (error) throw error;
      rows.push(...data); if (data.length < 500) break;
    }
    const { count, error } = await store.from('notification_outbox').select('id', { count: 'exact', head: true }).neq('status', 'sent');
    if (error) throw error;
    const photoGuests: { id: string; name: string }[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await store.from('invitation_guests').select('id,name').order('id').range(start, start + 499);
      if (error) throw error;
      photoGuests.push(...data); if (data.length < 500) break;
    }
    return json({ invitations: rows, photoGuests, pendingEmails: count ?? 0 });
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async (context) => {
  try {
    await requireAdmin(context);
    const body = await readJson(context.request);
    const store = db();
    if (body.action === 'remove') {
      if (!isUuid(body.id)) throw new InputError('Invalid invitation.');
      const result = await removeInvitation(store, body.id);
      return json({ removed: true, photosDeleted: result.photosDeleted, cleanupPending: result.cleanupPending });
    }
    if (body.action === 'remove-many') {
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BULK_REMOVE || !ids.every(isUuid) || new Set(ids).size !== ids.length)
        throw new InputError(`Select between 1 and ${MAX_BULK_REMOVE} invitations to remove.`);
      let removed = 0, photosDeleted = 0, cleanupPending = false;
      const failed: string[] = [];
      // One at a time: each invitation is deleted atomically, so a failure never half-deletes another.
      for (const id of ids as string[]) {
        try {
          const result = await removeInvitation(store, id);
          removed++; photosDeleted += result.photosDeleted; cleanupPending ||= result.cleanupPending;
        } catch (error) {
          if (error instanceof InputError) throw error;
          failed.push(id);
        }
      }
      return json({ removed, failed, photosDeleted, cleanupPending });
    }
    if (body.action === 'retry') {
      const { data, error } = await store.from('notification_outbox').select('id').neq('status', 'sent').order('created_at').limit(10);
      if (error) throw error;
      let sent = 0; for (const row of data) if (await deliverNotification(row.id)) sent++;
      return json({ sent });
    }
    if (body.action === 'rotate') {
      if (!isUuid(body.id)) throw new InputError('Invalid invitation.');
      const { data, error } = await store.rpc('rotate_invitation', { p_id: body.id });
      if (error?.code === 'PGRST202') throw new InputError('Invitation codes need a database update. Run supabase/migrations/005_invitation_codes.sql in the Supabase SQL editor, then try again.', 503);
      if (error) throw error;
      return json({ success: true, code: data?.code });
    }
    if (body.action !== 'create' && body.action !== 'rename') throw new InputError('Unknown action.');
    const household = textField(body.household, 'a household name', 120);
    const names = parseGuestNames(body.names);
    if (body.action === 'rename') {
      if (!isUuid(body.id)) throw new InputError('Invalid invitation.');
      const { error } = await store.rpc('rename_invitation_guests', { p_invitation:body.id, p_household:household, p_names:names });
      if (error) throw error;
      return json({ saved:true });
    }
    const { data, error } = await store.rpc('create_named_invitation', { p_household:household, p_names:names });
    if (error) throw error;
    const { data: created, error: codeError } = await store.from('invitations').select('code').eq('id', data.id).maybeSingle();
    if (codeError) throw codeError;
    return json({ token: data.token, code: created?.code ?? null }, 201);
  } catch (error) { return failure(error); }
};
