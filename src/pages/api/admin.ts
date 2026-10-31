import type { APIRoute } from 'astro';
import { db, failure, json, readJson, requireAdmin } from '../../lib/server';
import { InputError, isUuid, textField, parseGuestNames } from '../../lib/validation';
import { deliverNotification } from '../../lib/email';
export const prerender = false;
export const GET: APIRoute = async (context) => {
  try {
    await requireAdmin(context);
    const store = db();
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await store.from('invitations').select('id,token,household,max_guests,created_at,invitation_guests(id,name,position,attending),responses(name,email,attending,guests,message,updated_at)').order('created_at').order('id').range(start, start + 499);
      if (error) throw error;
      rows.push(...data); if (data.length < 500) break;
    }
    const { count, error } = await store.from('notification_outbox').select('id', { count: 'exact', head: true }).neq('status', 'sent');
    if (error) throw error;
    return json({ invitations: rows, pendingEmails: count ?? 0 });
  } catch (error) { return failure(error); }
};
export const POST: APIRoute = async (context) => {
  try {
    await requireAdmin(context);
    const body = await readJson(context.request);
    const store = db();
    if (body.action === 'retry') {
      const { data, error } = await store.from('notification_outbox').select('id').neq('status', 'sent').order('created_at').limit(10);
      if (error) throw error;
      let sent = 0; for (const row of data) if (await deliverNotification(row.id)) sent++;
      return json({ sent });
    }
    if (body.action === 'rotate') {
      if (!isUuid(body.id)) throw new InputError('Invalid invitation.');
      const { error } = await store.from('invitations').update({ token: crypto.randomUUID() }).eq('id', body.id);
      if (error) throw error;
      return json({ success: true });
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
    return json({ token: data.token }, 201);
  } catch (error) { return failure(error); }
};
