import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { csvCell, parseRsvp } from '../src/lib/validation';

const token = '26b39d80-25a7-4618-9d0d-21c586a2da25';
const valid = { token, name: 'Alex & Sam', email: 'alex@example.com', attending: true, guests: 2, message: 'We cannot wait!', website: '' };
test('RSVP accepts one or two guests and requires a message', () => {
  assert.equal(parseRsvp(valid).guests, 2);
  assert.equal(parseRsvp({ ...valid, guests: 1 }).guests, 1);
  for (const guests of [0, 3, -1, 1.5, '2']) assert.throws(() => parseRsvp({ ...valid, guests }));
  assert.throws(() => parseRsvp({ ...valid, message: '  ' }));
  assert.throws(() => parseRsvp({ ...valid, email: 'invalid' }));
  assert.throws(() => parseRsvp({ ...valid, token: 'guessable' }));
  assert.throws(() => parseRsvp({ ...valid, website: 'spam' }));
});
test('declining requires a zero headcount', () => {
  assert.equal(parseRsvp({ ...valid, attending: false, guests: 0 }).guests, 0);
  assert.throws(() => parseRsvp({ ...valid, attending: false, guests: 1 }));
});
test('CSV escapes quotes and neutralizes spreadsheet formula injection', () => {
  assert.equal(csvCell('Alex "A"'), '"Alex ""A"""');
  for (const input of ['=1+1', ' +SUM(A1)', '-1', '@SUM(1)', '\tvalue']) assert.ok(csvCell(input).startsWith('"\''));
});

const pg = new PGlite();
before(async () => {
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
});
after(async () => { await pg.close(); });
async function submit(invite: string, guests: number, attending = true, message = 'See you there!') {
  return pg.query<{ result: { saved: boolean; notification_id: string | null } }>(
    'select public.submit_rsvp($1,$2,$3,$4,$5,$6) as result', [invite, 'Alex', 'alex@example.com', attending, guests, message]);
}
async function allowUpdate() { await pg.exec("update public.responses set updated_at = now() - interval '11 seconds'"); }
test('database updates preserve one response and accurate headcounts; outbox is durable', async () => {
  await pg.query('insert into public.invitations(token,household,max_guests) values ($1,$2,2)', [token, 'Alex & Sam']);
  const first = await submit(token, 2);
  assert.ok(first.rows[0].result.notification_id);
  const replay = await submit(token, 2);
  assert.equal(replay.rows[0].result.notification_id, null);
  await assert.rejects(submit(token, 1), /PLEASE_WAIT/);
  await allowUpdate();
  await submit(token, 1);
  let totals = await pg.query<{ count: number; guests: number }>('select count(*)::int as count, sum(guests)::int as guests from public.responses');
  assert.deepEqual(totals.rows[0], { count: 1, guests: 1 });
  await allowUpdate(); await submit(token, 0, false, 'We are sorry to miss it.');
  totals = await pg.query('select count(*)::int as count, sum(guests)::int as guests from public.responses');
  assert.deepEqual(totals.rows[0], { count: 1, guests: 0 });
  const jobs = await pg.query<{ count: number }>('select count(*)::int as count from public.notification_outbox');
  assert.equal(jobs.rows[0].count, 3);
  const id = first.rows[0].result.notification_id;
  const claim = await pg.query<{ result: unknown }>('select public.claim_notification($1) as result', [id]);
  assert.ok(claim.rows[0].result);
  const repeatedClaim = await pg.query<{ result: unknown }>('select public.claim_notification($1) as result', [id]);
  assert.equal(repeatedClaim.rows[0].result, null);
  await pg.query("update public.notification_outbox set locked_at = now() - interval '6 minutes' where id = $1", [id]);
  const expiredClaim = await pg.query<{ result: unknown }>('select public.claim_notification($1) as result', [id]);
  assert.ok(expiredClaim.rows[0].result);
  await pg.query("update public.notification_outbox set status = 'sent' where id = $1", [id]);
  const sentClaim = await pg.query<{ result: unknown }>('select public.claim_notification($1) as result', [id]);
  assert.equal(sentClaim.rows[0].result, null);
});
test('database rejects unknown invitations and excess guests', async () => {
  const single = 'ff8325e4-75e2-446c-9e5f-53356a0f6de9';
  await pg.query('insert into public.invitations(token,household,max_guests) values ($1,$2,1)', [single, 'Solo']);
  await assert.rejects(submit(single, 2), /GUEST_LIMIT/);
  await assert.rejects(submit('00000000-0000-4000-8000-000000000000', 1), /INVITATION_NOT_FOUND/);
  await assert.rejects(pg.query('insert into public.invitations(household,max_guests) values ($1,3)', ['Too many']), /check constraint/);
});
test('guest database roles cannot read invitations or execute private functions', async () => {
  for (const role of ['anon', 'authenticated']) {
    const result = await pg.query<{ tables: boolean; submit: boolean }>(
      "select has_table_privilege($1, 'public.invitations','SELECT') as tables, has_function_privilege($1, 'public.submit_rsvp(uuid,text,text,boolean,integer,text)', 'EXECUTE') as submit", [role]);
    assert.deepEqual(result.rows[0], { tables: false, submit: false });
  }
});
