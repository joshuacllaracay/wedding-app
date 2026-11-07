-- Run once after 004_hard_delete_invitation.sql, before deploying the updated app.
-- Adds a short 4-digit code to every invitation, so guests without the link can
-- type it on the homepage. The long private link and QR keep working.
-- Because 4 digits are guessable, failed code lookups are rate limited.
begin;

create function public.new_invitation_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare candidate text;
begin
  for attempt in 1..200 loop
    candidate := lpad(floor(random() * 10000)::int::text, 4, '0');
    if not exists(select 1 from public.invitations where code = candidate) then return candidate; end if;
  end loop;
  raise exception 'CODES_EXHAUSTED';
end;
$$;

alter table public.invitations add column code text check (code ~ '^[0-9]{4}$');
do $$
declare row_id uuid;
begin
  for row_id in select id from public.invitations where code is null order by created_at loop
    update public.invitations set code = public.new_invitation_code() where id = row_id;
  end loop;
end $$;
alter table public.invitations alter column code set not null;
alter table public.invitations add constraint invitations_code_key unique (code);
-- New invitations (create_named_invitation) receive a code automatically.
alter table public.invitations alter column code set default public.new_invitation_code();

-- Replacing a link also replaces its code, so the old code stops working too.
create function public.rotate_invitation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.invitations%rowtype;
begin
  perform 1 from public.invitations where id = p_id and removed_at is null for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  update public.invitations set token = gen_random_uuid(), code = public.new_invitation_code()
    where id = p_id returning * into result;
  return jsonb_build_object('token', result.token, 'code', result.code);
end;
$$;

-- Failed lookups per client (a hashed IP address, never the raw IP).
create table public.invitation_code_attempts (
  client text not null,
  attempted_at timestamptz not null default now()
);
create index invitation_code_attempts_recent on public.invitation_code_attempts(client, attempted_at);
alter table public.invitation_code_attempts enable row level security;
revoke all on public.invitation_code_attempts from anon, authenticated;
grant all on public.invitation_code_attempts to service_role;

-- Returns the private token for a code, or null. Limits: 10 failed tries per
-- client and 300 failed tries overall per 15 minutes.
create function public.lookup_invitation_code(p_code text, p_client text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_token uuid;
begin
  delete from public.invitation_code_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from public.invitation_code_attempts
      where client = p_client and attempted_at > now() - interval '15 minutes') >= 10
    or (select count(*) from public.invitation_code_attempts
      where attempted_at > now() - interval '15 minutes') >= 300
  then raise exception 'TOO_MANY_ATTEMPTS'; end if;
  select token into found_token from public.invitations where code = p_code and removed_at is null;
  if found_token is null then
    insert into public.invitation_code_attempts(client) values(p_client);
  end if;
  return found_token;
end;
$$;

revoke all on function public.new_invitation_code() from public, anon, authenticated;
revoke all on function public.rotate_invitation(uuid) from public, anon, authenticated;
revoke all on function public.lookup_invitation_code(text,text) from public, anon, authenticated;
grant execute on function public.new_invitation_code(), public.rotate_invitation(uuid),
  public.lookup_invitation_code(text,text) to service_role;
commit;
