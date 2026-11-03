-- Run once after 002_guest_portal_memories.sql, before deploying the updated app.
begin;
alter table public.invitations add column removed_at timestamptz;

-- Keep guest identities and memories, but revoke the shared credential atomically.
create function public.remove_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.invitations where id = p_id for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  update public.invitations set removed_at = now(), token = gen_random_uuid()
    where id = p_id and removed_at is null;
  delete from public.notification_outbox where invitation_id = p_id and status <> 'sent';
end;
$$;
revoke all on function public.remove_invitation(uuid) from public, anon, authenticated;
grant execute on function public.remove_invitation(uuid) to service_role;

-- Hide before deleting Storage objects. Retain the reservation until old upload
-- tickets and in-flight finalizers expire; the existing cleanup job releases it.
create function public.remove_memory_photo(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare photo public.memory_photos%rowtype;
begin
  update public.memory_photos set status = 'cleaning'
    where id = p_id and status in ('ready','cleaning') returning * into photo;
  if not found then return null; end if;
  return jsonb_build_object('original_path',photo.original_path,'thumbnail_path',photo.thumbnail_path);
end;
$$;
revoke all on function public.remove_memory_photo(uuid) from public, anon, authenticated;
grant execute on function public.remove_memory_photo(uuid) to service_role;
commit;
