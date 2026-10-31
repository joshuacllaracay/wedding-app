-- Run ONCE after schema.sql, in the existing project's SQL editor.
-- Additive migration: existing invitations, tokens and responses are preserved.
begin;

create table public.invitation_guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  position integer not null check (position between 1 and 2),
  name text not null check (length(trim(name)) between 1 and 120),
  attending boolean,
  unique(invitation_id, position)
);
insert into public.invitation_guests(invitation_id, position, name, attending)
select i.id, p, case when i.max_guests = 1 then i.household else i.household || ' · Guest ' || p end,
  case when r.attending = false then false when r.guests = i.max_guests then true else null end
from public.invitations i cross join lateral generate_series(1, i.max_guests) p
left join public.responses r on r.invitation_id = i.id;

create table public.memory_settings (
  id boolean primary key default true check (id),
  mode text not null default 'closed' check (mode in ('closed','open','scheduled')),
  opens_at timestamptz,
  closes_at timestamptz,
  check (mode <> 'scheduled' or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);
insert into public.memory_settings(id) values(true);

create table public.memory_photos (
  id uuid primary key,
  guest_id uuid not null references public.invitation_guests(id) on delete cascade,
  original_path text not null unique,
  thumbnail_path text not null unique,
  filename text not null check (length(filename) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending','ready','rejected','cleaning')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '125 minutes',
  completed_at timestamptz
);
create index memory_photos_guest on public.memory_photos(guest_id);
create index memory_photos_gallery on public.memory_photos(completed_at desc, id) where status = 'ready';

alter table public.invitation_guests enable row level security;
alter table public.memory_settings enable row level security;
alter table public.memory_photos enable row level security;
revoke all on public.invitation_guests, public.memory_settings, public.memory_photos from anon, authenticated;
grant all on public.invitation_guests, public.memory_settings, public.memory_photos to service_role;

create function public.memories_are_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select mode = 'open' or
    (mode = 'scheduled' and now() >= opens_at and now() < closes_at)
    from public.memory_settings where id), false);
$$;

create function public.create_named_invitation(p_household text, p_names text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations%rowtype; n integer;
begin
  n := cardinality(p_names);
  if n is null or n not between 1 and 2 then raise exception 'GUEST_LIMIT'; end if;
  insert into public.invitations(household,max_guests) values(trim(p_household),n) returning * into invitation;
  insert into public.invitation_guests(invitation_id,position,name)
    select invitation.id, ord::integer, trim(name) from unnest(p_names) with ordinality as names(name,ord);
  return jsonb_build_object('id',invitation.id,'token',invitation.token);
end;
$$;

create function public.rename_invitation_guests(p_invitation uuid, p_household text, p_names text[])
returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations%rowtype;
begin
  select * into invitation from public.invitations where id = p_invitation for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if cardinality(p_names) is distinct from invitation.max_guests then raise exception 'GUEST_LIMIT'; end if;
  update public.invitations set household = trim(p_household) where id = p_invitation;
  update public.invitation_guests g set name = trim(n.name)
    from unnest(p_names) with ordinality as n(name,ord)
    where g.invitation_id = p_invitation and g.position = n.ord;
end;
$$;

create function public.submit_named_rsvp(p_token uuid, p_name text, p_email text, p_attending boolean, p_guest_ids uuid[], p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations%rowtype; result jsonb; selected uuid[]; previous uuid[];
  guest_count integer; changed boolean; notification uuid; names text[];
begin
  select * into invitation from public.invitations where token = p_token for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  select coalesce(array_agg(id order by id), '{}') into selected from (select distinct unnest(p_guest_ids) as id) s;
  guest_count := cardinality(selected);
  if guest_count is distinct from cardinality(p_guest_ids) or
    (p_attending and guest_count not between 1 and invitation.max_guests) or
    (not p_attending and guest_count <> 0) then raise exception 'GUEST_LIMIT'; end if;
  if exists(select 1 from unnest(selected) as selected_guest(guest_id) where not exists(
    select 1 from public.invitation_guests g where g.id = selected_guest.guest_id and g.invitation_id = invitation.id
  )) then raise exception 'GUEST_NOT_FOUND'; end if;
  select coalesce(array_agg(id order by id), '{}') into previous from public.invitation_guests
    where invitation_id = invitation.id and attending = true;
  changed := previous is distinct from selected;
  if changed and exists(select 1 from public.responses where invitation_id = invitation.id
    and updated_at > now() - interval '10 seconds') then raise exception 'PLEASE_WAIT'; end if;
  result := public.submit_rsvp(p_token,p_name,p_email,p_attending,guest_count,p_message);
  notification := (result->>'notification_id')::uuid;
  update public.invitation_guests set attending = (id = any(selected)) where invitation_id = invitation.id;
  select coalesce(array_agg(name order by position), '{}') into names from public.invitation_guests where id = any(selected);
  if changed and notification is null then
    update public.responses set updated_at = now() where invitation_id = invitation.id;
    insert into public.notification_outbox(invitation_id,payload) values(invitation.id,
      jsonb_build_object('household',invitation.household,'name',p_name,'email',p_email,'attending',p_attending,'guests',guest_count,'message',p_message))
      returning id into notification;
  end if;
  if notification is not null then
    update public.notification_outbox set payload = payload || jsonb_build_object('attending_names',names) where id = notification;
  end if;
  return jsonb_build_object('saved',true,'notification_id',notification);
end;
$$;

create function public.reserve_memory_photo(p_token uuid, p_guest uuid, p_id uuid, p_filename text, p_mime text, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare guest public.invitation_guests%rowtype; photo public.memory_photos%rowtype; extension text;
begin
  -- Lock settings against closing and one guest against concurrent reservations.
  perform 1 from public.memory_settings where id for share;
  if not public.memories_are_open() then raise exception 'UPLOADS_CLOSED'; end if;
  select g.* into guest from public.invitation_guests g join public.invitations i on i.id = g.invitation_id
    where g.id = p_guest and i.token = p_token for update of g;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  select * into photo from public.memory_photos where id = p_id;
  if found then
    if photo.guest_id <> p_guest or photo.filename <> p_filename or photo.mime_type <> p_mime or photo.byte_size <> p_bytes then raise exception 'INVALID_UPLOAD'; end if;
    return to_jsonb(photo);
  end if;
  if (select count(*) from public.memory_photos where guest_id = p_guest) >= 10 then raise exception 'PHOTO_LIMIT'; end if;
  extension := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
  if extension is null then raise exception 'INVALID_UPLOAD'; end if;
  insert into public.memory_photos(id,guest_id,filename,mime_type,byte_size,original_path,thumbnail_path)
    values(p_id,p_guest,p_filename,p_mime,p_bytes,
      'originals/' || p_guest || '/' || p_id || '.' || extension,
      'thumbnails/' || p_guest || '/' || p_id || '.webp') returning * into photo;
  return to_jsonb(photo);
end;
$$;

create function public.complete_memory_photo(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare photo public.memory_photos%rowtype;
begin
  perform 1 from public.memory_settings where id for share;
  select p.* into photo from public.memory_photos p join public.invitation_guests g on g.id = p.guest_id
    join public.invitations i on i.id = g.invitation_id where p.id = p_id and i.token = p_token for update of p;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  if photo.status = 'ready' then return; end if;
  if not public.memories_are_open() then raise exception 'UPLOADS_CLOSED'; end if;
  if photo.status <> 'pending' or photo.expires_at < now() then raise exception 'UPLOAD_EXPIRED'; end if;
  update public.memory_photos set status = 'ready',completed_at = now() where id = p_id;
end;
$$;

revoke all on function public.memories_are_open() from public, anon, authenticated;
revoke all on function public.create_named_invitation(text,text[]) from public, anon, authenticated;
revoke all on function public.rename_invitation_guests(uuid,text,text[]) from public, anon, authenticated;
revoke all on function public.submit_named_rsvp(uuid,text,text,boolean,uuid[],text) from public, anon, authenticated;
revoke all on function public.reserve_memory_photo(uuid,uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.complete_memory_photo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.memories_are_open(), public.create_named_invitation(text,text[]),
  public.rename_invitation_guests(uuid,text,text[]), public.submit_named_rsvp(uuid,text,text,boolean,uuid[],text),
  public.reserve_memory_photo(uuid,uuid,uuid,text,text,integer), public.complete_memory_photo(uuid,uuid) to service_role;

-- Private originals and thumbnails. No guest/public storage policies are created.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('wedding-memories','wedding-memories',false,10485760,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
commit;
