-- Run once after 007_six_character_codes.sql, before deploying the seating planner.
-- Admin-only seating plan: tables, and who sits at each one.
begin;

create table public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  capacity integer not null check (capacity between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- One row per person in the plan. Either a guest from the guest list (guest_id)
-- or an extra name typed by the couple (name). table_id null = not seated yet.
create table public.seating_people (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid unique references public.invitation_guests(id) on delete cascade,
  name text check (name is null or length(trim(name)) between 1 and 120),
  table_id uuid references public.seating_tables(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((guest_id is null) <> (name is null))
);
create index seating_people_table on public.seating_people(table_id);

alter table public.seating_tables enable row level security;
alter table public.seating_people enable row level security;
revoke all on public.seating_tables, public.seating_people from anon, authenticated;
grant all on public.seating_tables, public.seating_people to service_role;

-- Seat people at a table (or unseat them with p_table = null) in one step,
-- refusing if the table would go over its number of seats.
create function public.seat_people(p_table uuid, p_people uuid[], p_guests uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare seats integer; taken integer; incoming integer;
begin
  if p_table is not null then
    select capacity into seats from public.seating_tables where id = p_table for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
    select count(*) into taken from public.seating_people
      where table_id = p_table and not (id = any(coalesce(p_people, '{}')) or guest_id = any(coalesce(p_guests, '{}')));
    incoming := cardinality(coalesce(p_people, '{}')) + cardinality(coalesce(p_guests, '{}'));
    if taken + incoming > seats then raise exception 'TABLE_FULL'; end if;
  end if;
  update public.seating_people set table_id = p_table where id = any(coalesce(p_people, '{}'));
  insert into public.seating_people(guest_id, table_id)
    select g, p_table from unnest(coalesce(p_guests, '{}')) as g
    where exists(select 1 from public.invitation_guests ig where ig.id = g)
    on conflict (guest_id) do update set table_id = excluded.table_id;
end;
$$;
revoke all on function public.seat_people(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.seat_people(uuid, uuid[], uuid[]) to service_role;
commit;
