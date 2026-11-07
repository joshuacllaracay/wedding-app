-- Run once after 005_invitation_codes.sql, before deploying the updated app.
-- Each RSVP notification now sends two emails: one to the couple and a
-- confirmation to the guest. Tracking each separately means a retry never
-- re-sends an email that already went out.
begin;
alter table public.notification_outbox
  add column couple_sent_at timestamptz,
  add column guest_sent_at timestamptz;
-- Notifications already delivered before this change: don't email guests retroactively.
update public.notification_outbox
  set couple_sent_at = coalesce(sent_at, now()), guest_sent_at = coalesce(sent_at, now())
  where status = 'sent';
commit;
