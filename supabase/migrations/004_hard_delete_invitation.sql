-- Run once after 003_admin_removal.sql, before deploying the updated app.
-- Removing an invitation now permanently deletes it from the database:
-- the invitation, its named guests, RSVP, pending emails and every photo row
-- (via ON DELETE CASCADE). The app then deletes the Storage files it returns.
begin;

create function public.delete_invitation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare guest_ids uuid[]; paths text[];
begin
  perform 1 from public.invitations where id = p_id for update;
  if not found then return null; end if;
  -- Lock the guests so no upload can be reserved for them while we delete.
  perform 1 from public.invitation_guests where invitation_id = p_id for update;
  select coalesce(array_agg(id), '{}') into guest_ids
    from public.invitation_guests where invitation_id = p_id;
  select coalesce(array_agg(path), '{}') into paths from (
    select p.original_path as path from public.memory_photos p where p.guest_id = any(guest_ids)
    union all
    select p.thumbnail_path from public.memory_photos p where p.guest_id = any(guest_ids)
  ) s;
  delete from public.invitations where id = p_id;
  return jsonb_build_object('guest_ids', to_jsonb(guest_ids), 'paths', to_jsonb(paths));
end;
$$;
revoke all on function public.delete_invitation(uuid) from public, anon, authenticated;
grant execute on function public.delete_invitation(uuid) to service_role;
commit;
