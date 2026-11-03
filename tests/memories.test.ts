import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseGuestNames, parseNamedRsvp } from '../src/lib/validation';
import { parseMemorySettings, parsePhoto } from '../src/lib/memories';

const pg=new PGlite();
const legacyToken='aa000000-0000-4000-8000-000000000001';
let token:string,guest1:string,guest2:string,foreignGuest:string;
before(async()=>{
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await pg.query("insert into public.invitations(household,max_guests,token) values('Existing pair',2,$1)",[legacyToken]);
  await pg.query("select public.submit_rsvp($1,'Alex','a@example.com',true,1,'See you soon')",[legacyToken]);
  // Storage is a managed Supabase schema; model its bucket metadata for SQL tests.
  await pg.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  await pg.exec(await readFile(new URL('../supabase/migrations/002_guest_portal_memories.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../supabase/migrations/003_admin_removal.sql',import.meta.url),'utf8'));
  const created=await pg.query<{result:{id:string;token:string}}>("select public.create_named_invitation('Alex & Sam',array['Alex','Sam']) as result");token=created.rows[0].result.token;
  const guests=await pg.query<{id:string}>('select id from public.invitation_guests where invitation_id=$1 order by position',[created.rows[0].result.id]);[guest1,guest2]=guests.rows.map(g=>g.id);
  const outsider=await pg.query<{result:{id:string}}>("select public.create_named_invitation('Jamie',array['Jamie']) as result");
  foreignGuest=(await pg.query<{id:string}>('select id from public.invitation_guests where invitation_id=$1',[outsider.rows[0].result.id])).rows[0].id;
});
after(async()=>{await pg.close();});
const reserve=(guest:string,id=crypto.randomUUID())=>pg.query<{result:{id:string}}>("select public.reserve_memory_photo($1,$2,$3,'photo.jpg','image/jpeg',100) as result",[token,guest,id]);
test('migration preserves legacy tokens, RSVP counts and ambiguous guest identities',async()=>{
  const result=await pg.query<{guests:number;count:number;known:number}>('select r.guests,count(g.id)::int as count,count(g.attending)::int as known from public.invitations i join public.responses r on r.invitation_id=i.id join public.invitation_guests g on g.invitation_id=i.id where i.token=$1 group by r.guests',[legacyToken]);
  assert.deepEqual(result.rows[0],{guests:1,count:2,known:0});
});
test('named RSVP validates invitation ownership and updates the selected people',async()=>{
  await assert.rejects(pg.query("select public.submit_named_rsvp($1,'Alex','a@example.com',true,$2,'See you')",[token,[foreignGuest]]),/GUEST_NOT_FOUND/);
  await assert.rejects(pg.query("select public.submit_named_rsvp($1,'Alex','a@example.com',true,$2,'See you')",[token,[guest1,guest1]]),/GUEST_LIMIT/);
  await pg.query("select public.submit_named_rsvp($1,'Alex','a@example.com',true,$2,'See you')",[token,[guest1,guest2]]);
  await pg.exec("update public.responses set updated_at=now()-interval '11 seconds'");
  await pg.query("select public.submit_named_rsvp($1,'Alex','a@example.com',true,$2,'See you')",[token,[guest2]]);
  const guests=await pg.query<{id:string;attending:boolean}>('select id,attending from public.invitation_guests where id=any($1) order by position',[[guest1,guest2]]);
  assert.deepEqual(guests.rows,[{id:guest1,attending:false},{id:guest2,attending:true}]);
  await pg.exec("update public.responses set updated_at=now()-interval '11 seconds'");
  await pg.query("select public.submit_named_rsvp($1,'Alex','a@example.com',true,$2,'See you')",[token,[guest1]]);
  const response=await pg.query<{guests:number}>('select guests from public.responses where invitation_id=(select id from public.invitations where token=$1)',[token]);assert.equal(response.rows[0].guests,1);
  const notification=await pg.query<{names:string[]}>('select payload->\'attending_names\' as names from public.notification_outbox where invitation_id=(select id from public.invitations where token=$1) order by created_at desc limit 1',[token]);assert.deepEqual(notification.rows[0].names,['Alex']);
});
test('upload schedule is closed by default and enforces both boundaries',async()=>{
  await assert.rejects(reserve(guest1),/UPLOADS_CLOSED/);
  await pg.exec("update public.memory_settings set mode='scheduled',opens_at=now()+interval '1 day',closes_at=now()+interval '2 days'");
  await assert.rejects(reserve(guest1),/UPLOADS_CLOSED/);
  await pg.exec("update public.memory_settings set opens_at=now()-interval '2 days',closes_at=now()-interval '1 day'");
  await assert.rejects(reserve(guest1),/UPLOADS_CLOSED/);
  await pg.exec("update public.memory_settings set opens_at=now()-interval '1 minute',closes_at=now()+interval '1 day'");
  const open=await pg.query<{open:boolean}>('select public.memories_are_open() as open');assert.equal(open.rows[0].open,true);
});
test('quota is ten per named person, counts pending uploads, and reservations are idempotent',async()=>{
  await pg.exec("update public.memory_settings set mode='open'");
  const id=crypto.randomUUID();await reserve(guest1,id);await reserve(guest1,id);
  for(let i=0;i<9;i++)await reserve(guest1);
  await assert.rejects(reserve(guest1),/PHOTO_LIMIT/);
  const second=await reserve(guest2);assert.ok(second.rows[0].result.id);
  await assert.rejects(reserve(foreignGuest),/GUEST_NOT_FOUND/);
  await assert.rejects(reserve(guest2,id),/INVALID_UPLOAD/);
});
test('finalization rejects closed windows and foreign photos; saved photos are idempotent',async()=>{
  const id=(await reserve(guest2)).rows[0].result.id;
  await pg.exec("update public.memory_settings set mode='closed'");
  await assert.rejects(pg.query('select public.complete_memory_photo($1,$2)',[token,id]),/UPLOADS_CLOSED/);
  await pg.exec("update public.memory_settings set mode='open'");
  await assert.rejects(pg.query('select public.complete_memory_photo($1,$2)',[legacyToken,id]),/GUEST_NOT_FOUND/);
  await pg.query('select public.complete_memory_photo($1,$2)',[token,id]);await pg.query('select public.complete_memory_photo($1,$2)',[token,id]);
  const complete=await pg.query<{status:string}>('select status from public.memory_photos where id=$1',[id]);assert.equal(complete.rows[0].status,'ready');
  const expired=(await reserve(guest2)).rows[0].result.id;
  await pg.query("update public.memory_photos set expires_at=now()-interval '1 minute' where id=$1",[expired]);
  await assert.rejects(pg.query('select public.complete_memory_photo($1,$2)',[token,expired]),/UPLOAD_EXPIRED/);
});
test('renaming keeps guest IDs, invitation token and photos; public access stays revoked',async()=>{
  const invitation=await pg.query<{id:string}>('select id from public.invitations where token=$1',[token]);
  await pg.query("select public.rename_invitation_guests($1,'Alex & Samuel',array['Alex','Samuel'])",[invitation.rows[0].id]);
  const renamed=await pg.query<{name:string}>('select name from public.invitation_guests where id=$1',[guest2]);assert.equal(renamed.rows[0].name,'Samuel');
  for(const role of ['anon','authenticated']){
    for(const table of ['invitation_guests','memory_settings','memory_photos']){
      const permissions=await pg.query<{allowed:boolean}>("select has_table_privilege($1,$2,'SELECT') as allowed",[role,`public.${table}`]);assert.equal(permissions.rows[0].allowed,false);
    }
    const permissions=await pg.query<{allowed:boolean}>("select has_function_privilege($1,'public.reserve_memory_photo(uuid,uuid,uuid,text,text,integer)','EXECUTE') as allowed",[role]);assert.equal(permissions.rows[0].allowed,false);
  }
  const bucket=await pg.query<{public:boolean}>('select public from storage.buckets');assert.equal(bucket.rows[0].public,false);
});
test('form validators enforce names, selected guests, image limits and timezone-aware schedules',()=>{
  assert.deepEqual(parseGuestNames([' Alex ','Sam']),['Alex','Sam']);assert.throws(()=>parseGuestNames(['']));assert.throws(()=>parseGuestNames(['a','b','c']));
  const valid={token,name:'Alex',email:'alex@example.com',attending:true,guestIds:[guest1],message:'See you'};
  assert.equal(parseNamedRsvp(valid).guests,1);assert.throws(()=>parseNamedRsvp({...valid,guestIds:[]}));assert.throws(()=>parseNamedRsvp({...valid,guestIds:[guest1,guest1]}));
  assert.throws(()=>parsePhoto({filename:'x.svg',mimeType:'image/svg+xml',byteSize:100}));assert.throws(()=>parsePhoto({filename:'x.jpg',mimeType:'image/jpeg',byteSize:11*1024*1024}));
  assert.equal(parseMemorySettings({mode:'scheduled',opensAt:'2027-06-12T10:00:00+08:00',closesAt:'2027-06-15T10:00:00+08:00'}).opens_at,'2027-06-12T02:00:00.000Z');
  assert.throws(()=>parseMemorySettings({mode:'scheduled',opensAt:'2027-06-12T10:00',closesAt:'2027-06-15T10:00'}));
  assert.throws(()=>parseMemorySettings({mode:'scheduled',opensAt:'2027-06-15T10:00:00Z',closesAt:'2027-06-12T10:00:00Z'}));
});

test('removing an invitation revokes its QR, excludes its RSVP, and preserves named memories',async()=>{
  const created=(await pg.query<{result:{id:string;token:string}}>("select public.create_named_invitation('Remove me',array['Pat','Lee']) as result")).rows[0].result;
  const guest=(await pg.query<{id:string}>('select id from public.invitation_guests where invitation_id=$1 order by position',[created.id])).rows[0].id;
  await pg.query("select public.submit_named_rsvp($1,'Pat','pat@example.com',true,$2,'Yes')",[created.token,[guest]]);
  await pg.exec("update public.memory_settings set mode='open'");
  const photo=crypto.randomUUID();
  await pg.query("select public.reserve_memory_photo($1,$2,$3,'photo.jpg','image/jpeg',100)",[created.token,guest,photo]);
  await pg.query('select public.complete_memory_photo($1,$2)',[created.token,photo]);
  await pg.query('select public.remove_invitation($1)',[created.id]);
  await pg.query('select public.remove_invitation($1)',[created.id]);
  assert.equal((await pg.query('select id from public.invitations where token=$1',[created.token])).rows.length,0);
  assert.equal((await pg.query('select r.* from public.responses r join public.invitations i on i.id=r.invitation_id where i.removed_at is null and i.id=$1',[created.id])).rows.length,0);
  assert.equal((await pg.query('select * from public.notification_outbox where invitation_id=$1',[created.id])).rows.length,0);
  assert.equal((await pg.query("select * from public.memory_photos where id=$1 and status='ready'",[photo])).rows.length,1);
  assert.equal((await pg.query('select * from public.invitation_guests where invitation_id=$1',[created.id])).rows.length,2);
  await assert.rejects(pg.query("select public.submit_named_rsvp($1,'Pat','pat@example.com',true,$2,'Yes')",[created.token,[guest]]),/INVITATION_NOT_FOUND/);
  await assert.rejects(pg.query("select public.reserve_memory_photo($1,$2,$3,'photo.jpg','image/jpeg',100)",[created.token,guest,crypto.randomUUID()]),/GUEST_NOT_FOUND/);
  await assert.rejects(pg.query('select public.complete_memory_photo($1,$2)',[created.token,photo]),/GUEST_NOT_FOUND/);
});

test('photo removal hides before storage cleanup, is retryable, and blocks finalization replay',async()=>{
  const id=(await reserve(guest2)).rows[0].result.id;
  // A pending upload cannot be removed through the completed-photo moderation action.
  assert.equal((await pg.query<{result:unknown}>('select public.remove_memory_photo($1) as result',[id])).rows[0].result,null);
  await pg.query('select public.complete_memory_photo($1,$2)',[token,id]);
  const remove=()=>pg.query<{result:{original_path:string;thumbnail_path:string}}>('select public.remove_memory_photo($1) as result',[id]);
  const first=(await remove()).rows[0].result;
  assert.ok(first.original_path.endsWith(`${id}.jpg`));assert.ok(first.thumbnail_path.endsWith(`${id}.webp`));
  assert.deepEqual((await remove()).rows[0].result,first);
  assert.equal((await pg.query("select id from public.memory_photos where id=$1 and status='ready'",[id])).rows.length,0);
  assert.equal((await pg.query("select id from public.memory_photos where id=$1 and status='cleaning'",[id])).rows.length,1);
  await assert.rejects(pg.query('select public.complete_memory_photo($1,$2)',[token,id]),/UPLOAD_EXPIRED/);
  for(const role of ['anon','authenticated']){
    for(const fn of ['remove_invitation','remove_memory_photo']){
      const result=await pg.query<{allowed:boolean}>("select has_function_privilege($1,$2,'EXECUTE') as allowed",[role,`public.${fn}(uuid)`]);
      assert.equal(result.rows[0].allowed,false);
    }
  }
});
