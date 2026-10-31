-- Run once in your Supabase SQL editor. These tables have no public access.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  household text not null check (length(household) between 1 and 120),
  max_guests integer not null check (max_guests between 1 and 2),
  created_at timestamptz not null default now()
);

create table public.responses (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  attending boolean not null,
  guests integer not null,
  message text not null check (length(message) between 1 and 2000),
  updated_at timestamptz not null default now(),
  check ((attending and guests between 1 and 2) or (not attending and guests = 0))
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','failed','sent')),
  attempts integer not null default 0,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_pending on public.notification_outbox(created_at) where status <> 'sent';
alter table public.invitations enable row level security;
alter table public.responses enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.invitations, public.responses, public.notification_outbox from anon, authenticated;
grant all on public.invitations, public.responses, public.notification_outbox to service_role;

-- Lock one household while updating: simultaneous submissions cannot duplicate guests.
create function public.submit_rsvp(p_token uuid, p_name text, p_email text, p_attending boolean, p_guests integer, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  invitation public.invitations%rowtype;
  previous public.responses%rowtype;
  notification uuid;
begin
  select * into invitation from public.invitations where token = p_token for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if p_guests > invitation.max_guests then raise exception 'GUEST_LIMIT'; end if;
  select * into previous from public.responses where invitation_id = invitation.id;
  if found then
    if (previous.name, previous.email, previous.attending, previous.guests, previous.message)
      is not distinct from (p_name, p_email, p_attending, p_guests, p_message) then
      return jsonb_build_object('saved', true, 'notification_id', null);
    end if;
    if previous.updated_at > now() - interval '10 seconds' then raise exception 'PLEASE_WAIT'; end if;
  end if;
  insert into public.responses(invitation_id, name, email, attending, guests, message)
    values(invitation.id, p_name, p_email, p_attending, p_guests, p_message)
    on conflict(invitation_id) do update set name = excluded.name, email = excluded.email,
      attending = excluded.attending, guests = excluded.guests, message = excluded.message, updated_at = now();
  insert into public.notification_outbox(invitation_id, payload) values(invitation.id,
    jsonb_build_object('household', invitation.household, 'name', p_name, 'email', p_email,
      'attending', p_attending, 'guests', p_guests, 'message', p_message)) returning id into notification;
  return jsonb_build_object('saved', true, 'notification_id', notification);
end;
$$;

-- Atomic lease avoids concurrent email retries; interrupted work becomes retryable.
create function public.claim_notification(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.notification_outbox%rowtype;
begin
  update public.notification_outbox set status = 'sending', locked_at = now(), attempts = attempts + 1
    where id = p_id and (status in ('pending', 'failed') or (status = 'sending' and locked_at < now() - interval '5 minutes'))
    returning * into job;
  if not found then return null; end if;
  return jsonb_build_object('id', job.id, 'payload', job.payload);
end;
$$;
revoke all on function public.submit_rsvp(uuid,text,text,boolean,integer,text) from public, anon, authenticated;
revoke all on function public.claim_notification(uuid) from public, anon, authenticated;
grant execute on function public.submit_rsvp(uuid,text,text,boolean,integer,text) to service_role;
grant execute on function public.claim_notification(uuid) to service_role;
