-- Run once after 006_guest_confirmation_email.sql, then deploy the updated app right away.
-- Invitation codes become 6 random characters (e.g. K7MP3Q) instead of 4 digits.
-- Letters and digits that look alike (0/O, 1/I/L) are never used, so codes are easy to read
-- and type: 31^6 ≈ 887 million possible codes, versus 10,000 before.
-- Every existing invitation gets a NEW code. Private links and QR codes are unchanged.
begin;

alter table public.invitations drop constraint if exists invitations_code_check;
alter table public.invitations alter column code drop default;

create or replace function public.new_invitation_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  for attempt in 1..50 loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists(select 1 from public.invitations where code = candidate) then return candidate; end if;
  end loop;
  raise exception 'CODES_EXHAUSTED';
end;
$$;

-- Give every invitation a fresh 6-character code (one at a time, so each is unique).
do $$
declare row_id uuid;
begin
  for row_id in select id from public.invitations order by created_at loop
    update public.invitations set code = public.new_invitation_code() where id = row_id;
  end loop;
end $$;

alter table public.invitations add constraint invitations_code_check check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
alter table public.invitations alter column code set default public.new_invitation_code();

-- Old failed-attempt counters belonged to 4-digit guessing; start fresh.
delete from public.invitation_code_attempts;
commit;
