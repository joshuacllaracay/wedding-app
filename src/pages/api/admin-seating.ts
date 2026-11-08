import type { APIRoute } from 'astro';
import { db, failure, json, readJson, requireAdmin } from '../../lib/server';
import { InputError, isUuid, textField } from '../../lib/validation';
export const prerender = false;

const MIGRATION_HINT = 'The seating planner needs a database update. Run supabase/migrations/008_seating.sql in the Supabase SQL editor, then refresh.';
const needsMigration = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202';
const uuidList = (value: unknown, max = 200) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || !value.every(isUuid)) throw new InputError('Invalid selection.');
  return [...new Set(value as string[])];
};
const capacityOf = (value: unknown) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 40) throw new InputError('Seats per table must be between 1 and 40.');
  return n;
};

// Everything the planner needs, in one request.
export const GET: APIRoute = async context => {
  try {
    await requireAdmin(context);
    const store = db();
    const [tables, people, guests] = await Promise.all([
      store.from('seating_tables').select('id,name,capacity,position').order('position').order('created_at'),
      store.from('seating_people').select('id,guest_id,name,table_id'),
      store.from('invitation_guests').select('id,name,position,attending,invitations!inner(id,household,removed_at)').is('invitations.removed_at', null),
    ]);
    for (const result of [tables, people]) if (needsMigration(result.error)) throw new InputError(MIGRATION_HINT, 503);
    for (const result of [tables, people, guests]) if (result.error) throw result.error;
    const list = (guests.data ?? []).map(g => {
      const invite = Array.isArray(g.invitations) ? g.invitations[0] : g.invitations;
      return { id: g.id, name: g.name, position: g.position, attending: g.attending, invitationId: invite?.id, household: invite?.household ?? '' };
    });
    return json({ tables: tables.data, people: people.data, guests: list });
  } catch (error) { return failure(error); }
};

export const POST: APIRoute = async context => {
  try {
    await requireAdmin(context);
    const body = await readJson(context.request);
    const store = db();
    switch (body.action) {
      case 'add-table': {
        const name = textField(body.name, 'a table name', 60);
        const capacity = capacityOf(body.capacity);
        const { count } = await store.from('seating_tables').select('id', { count: 'exact', head: true });
        if ((count ?? 0) >= 150) throw new InputError('You can plan up to 150 tables.');
        const { data, error } = await store.from('seating_tables').insert({ name, capacity, position: count ?? 0 }).select('id,name,capacity,position').single();
        if (needsMigration(error)) throw new InputError(MIGRATION_HINT, 503);
        if (error) throw error;
        return json({ table: data }, 201);
      }
      case 'update-table': {
        if (!isUuid(body.id)) throw new InputError('Invalid table.');
        const name = textField(body.name, 'a table name', 60);
        const capacity = capacityOf(body.capacity);
        const { count, error: countError } = await store.from('seating_people').select('id', { count: 'exact', head: true }).eq('table_id', body.id);
        if (countError) throw countError;
        if ((count ?? 0) > capacity) throw new InputError(`${count} people are already seated here. Move some first, or keep at least ${count} seats.`);
        const { error } = await store.from('seating_tables').update({ name, capacity }).eq('id', body.id);
        if (error) throw error;
        return json({ saved: true });
      }
      case 'remove-table': {
        if (!isUuid(body.id)) throw new InputError('Invalid table.');
        // People at this table go back to "Not yet seated" (on delete set null).
        const { error } = await store.from('seating_tables').delete().eq('id', body.id);
        if (error) throw error;
        return json({ removed: true });
      }
      case 'seat': {
        if (body.tableId !== null && !isUuid(body.tableId)) throw new InputError('Invalid table.');
        const people = uuidList(body.people), guests = uuidList(body.guests);
        if (!people.length && !guests.length) throw new InputError('Choose who to seat.');
        const { error } = await store.rpc('seat_people', { p_table: body.tableId, p_people: people, p_guests: guests });
        if (error?.message?.includes('TABLE_FULL')) throw new InputError('That table doesn’t have enough free seats.', 409);
        if (error?.message?.includes('TABLE_NOT_FOUND')) throw new InputError('That table no longer exists. Refresh the planner.', 404);
        if (needsMigration(error)) throw new InputError(MIGRATION_HINT, 503);
        if (error) throw error;
        return json({ saved: true });
      }
      case 'add-name': {
        const name = textField(body.name, 'a name', 120);
        const { count } = await store.from('seating_people').select('id', { count: 'exact', head: true }).not('name', 'is', null);
        if ((count ?? 0) >= 500) throw new InputError('You can add up to 500 extra names.');
        const { data, error } = await store.from('seating_people').insert({ name }).select('id,guest_id,name,table_id').single();
        if (needsMigration(error)) throw new InputError(MIGRATION_HINT, 503);
        if (error) throw error;
        return json({ person: data }, 201);
      }
      case 'remove-name': {
        if (!isUuid(body.id)) throw new InputError('Invalid name.');
        // Only typed-in names can be deleted; guest-list guests are managed on the Guests page.
        const { error } = await store.from('seating_people').delete().eq('id', body.id).not('name', 'is', null);
        if (error) throw error;
        return json({ removed: true });
      }
      default:
        throw new InputError('Unknown action.');
    }
  } catch (error) { return failure(error); }
};
