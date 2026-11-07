# Chyka & Emmanuel — Wedding invitation

A mobile-first Astro + TypeScript invitation with an animated envelope, optional music, private invitation links and QR codes, named RSVPs, and a private wedding portal with scheduled photo sharing. The colors follow the supplied ivory/champagne/taupe palette. The invitation, guest photo page, and admin portal use this **same repository and deployment**; no separate CRM repository is needed.

The couple’s names are real; the date, venue, deadline, and dress-code wording are **sample details**. A visible preview banner remains enabled until `sampleDetails` is changed in `src/config/wedding.ts`.

## Run locally

Use **Node 22.19+ (Node 24 LTS recommended)** and npm.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Astro (normally `http://127.0.0.1:4321`). Tap the envelope to reveal the invitation and start the sample audio. The RSVP section has a development-only **Preview RSVP form** button so you can inspect both attendance options without service credentials. Preview responses are never saved or emailed. That button is excluded from production builds.

```sh
npm run check
npm test
npm run build
```

The tests execute the SQL functions using an embedded PostgreSQL engine (PGlite), including RSVP replacement, replay protection, headcount limits, notification leases, and role permissions. Live Supabase Auth and Resend delivery need separate verification after configuring the accounts. In environments that block Node child processes, the dev server and test runner need permission to start their workers. Set `ASTRO_TELEMETRY_DISABLED=1` when telemetry configuration storage is restricted.

## Connect Supabase

1. For a new project, run `supabase/schema.sql` **once**, then `supabase/migrations/002_guest_portal_memories.sql` **once** in the SQL editor. If you already ran `schema.sql`, run **only the new migration**. It preserves existing invitation tokens, responses, and notifications, adds named guests and photo settings, and creates the private `wedding-memories` storage bucket. Run the migration before starting/deploying this version of the app.
   Then run `supabase/migrations/003_admin_removal.sql` once to enable invitation removal and photo moderation. Existing projects that already ran migration 002 need only migration 003 before deploying this update.
   Then run `supabase/migrations/004_hard_delete_invitation.sql` once. After it, **Remove invitation** permanently deletes the invitation, its guests, RSVP, pending emails, and every photo those guests uploaded (database rows and Storage files).
   Then run `supabase/migrations/005_invitation_codes.sql` once. It gives every invitation a 4-digit code that guests can type on the homepage instead of opening their link. **Replace link** also replaces the code. Failed code attempts are limited to 10 per visitor (and 300 overall) every 15 minutes, so codes can't be guessed quickly.
2. Copy `.env.example` to `.env` and enter the project URL, anon key, and service-role key. All variables in this project are server-only; never prefix these keys with `PUBLIC_`.
3. In Supabase Authentication → Users, create your own email/password user as the wedding administrator. Your Supabase dashboard login does not automatically create a portal user. Add this user UUID to `ADMIN_USER_IDS`. The bride and groom do not need accounts when you manage the portal for them. Additional admin IDs can be comma-separated if you later want to give them access. Disable public sign-ups if you do not need them. The application provides no public registration screen.
4. Restart Astro after changing environment variables. Open `/login`, sign in, then use `/admin` to create invitations with a **one- or two-person allowance**.

The service-role key is used only by server endpoints. Row-level security is enabled with no anonymous or authenticated table access. Admin access requires a verified Supabase Auth session **and** an explicitly allowed user ID. Sessions use HttpOnly, SameSite cookies, become Secure on HTTPS, and expire with the Supabase access token (normally about an hour). Sign in again after expiry; persistent refresh-token storage is intentionally omitted.

## Connect email

1. Create a Resend account and verify a sending domain.
2. Set `RESEND_API_KEY`, `RSVP_EMAIL_FROM` (on that domain), and `RSVP_EMAIL_TO` (the bride and groom’s inboxes, comma-separated).
3. Restart the local server or redeploy after changing environment variables.

An RSVP is saved transactionally with a notification-outbox entry before the email is attempted. Email failures do not lose the RSVP. The dashboard shows unsent notifications and can retry ten at a time. Retries use atomic leases and Resend idempotency keys to avoid simultaneous sends. A notification interrupted during sending becomes retryable after five minutes. Resend’s idempotency retention is finite, so an ambiguous delivery retried much later may produce a duplicate email; it cannot duplicate the saved headcount. There is no automatic background retry job in this version. “Sent” means the provider accepted the message, not guaranteed inbox placement.

## Guest workflow

1. In `/admin`, choose one or two people and enter **each guest's name**. An optional invitation label can group the pair (for example, “Alex & Sam”). The names and invitation are created in one transaction before a QR is generated. Use **Edit names** for corrections; it keeps the guest IDs, photo allowances, token, and RSVP. The number of people on an existing invitation is fixed.
2. Copy the generated private link or download its QR code. Each QR encodes that invitation’s URL: `/?invite=<random-UUID>`.
3. Share that link/QR with the invited person. The recipient chooses attending/declining, enters their name and email, checks the names of the people attending, and writes a message or reason. A pair can choose either person or both. The server calculates the count from those names and rejects names from other invitations.
4. The same private link lets them update their existing response. Counts reflect the latest saved response. Identical resubmissions are idempotent; changed responses are limited to one every ten seconds per invitation.
5. View confirmed **people**, accepting/declining **invitations**, and unanswered invitations in the dashboard. Search by name/email or export the full list as CSV.

Private links are bearer credentials: anyone holding one can read and update that invitation’s response, including its contact email and message, and upload as either named person when sharing is open. They do not provide access to the couple's gallery or originals. Share them directly. If one leaks, use **Replace link** in the dashboard, then share its new link/QR. The old invitation link stops working; previously issued Storage upload tickets expire within two hours and cannot finalize photos with a revoked invitation token. The RSVP and completed memories are retained. Avoid third-party analytics that capture invitation URLs. Referrer policy prevents links leaking to other sites through the Referer header. Guests’ RSVP data is private; the invitation’s general wedding details are publicly accessible at `/`.

## Upgrade existing invitations

The migration keeps every original invitation and its allowance. Old single-person invitations use the existing invitation label as the initial guest name; pairs receive `Invitation label · Guest 1` / `Guest 2`. Rename these in the portal before sharing. Old RSVP totals are preserved. If an old pair accepted for just one person, the migration does not guess which person: both individual attendance values stay unknown until they submit a named response. The dashboard still counts the saved total correctly.

## Scheduled memories and downloads

In `/admin`, **Photo sharing** has three modes:

- **Closed** (the default): the invitation's sharing section is hidden and server requests to start or finalize uploads are rejected.
- **Scheduled**: set opening and closing date/times in **Singapore time (UTC+08)**. Times are stored as UTC instants. Opening is inclusive; closing is exclusive. No redeploy or automation job is required.
- **Open now**: upload sharing stays open until you switch it off, regardless of saved schedule dates.

Guests reopen their existing invitation/QR. The sharing section appears when they load the invitation during the window; already open pages refresh availability approximately every minute and on returning to the tab. It links to `/memories?invite=...`, where guests select their own name and share up to **10 completed photos per person across all visits**. Both people on a shared invitation can select either name; this is not independent identity verification.

Uploads support still JPG, PNG, and WebP images up to **10 MiB and 40 megapixels**. HEIC/HEIF must be exported as JPG first. The browser uploads directly to the private Supabase bucket with a signed, non-overwriting ticket, avoiding Vercel's request-body limit. Server code checks the actual file size, image format, dimensions, and decodability, generates a smaller WebP thumbnail without EXIF metadata, then marks the photo ready. Original files (including any original metadata) are preserved for the admin to download. Photo finalization rechecks the schedule, so a transfer begun before closing but finished after closing is not added to the gallery unless sharing reopens in time.

Photo reservations are atomic and pending transfers count toward the limit, preventing concurrent tabs from exceeding ten. Guests can retry the same selected files or use **Finish pending uploads** if their transfer succeeded but finalization was interrupted. Reservations last 125 minutes. The portal can **Release expired slots** after a further ten-minute grace period (about 2¼ hours total): it removes only expired unfinished/rejected objects and then releases their reservations. Completed photos are never removed by cleanup. Cleanup is manual and runs in batches of 50. This delay is intentional because issued upload tickets remain valid for two hours.

**Our memories** shows paginated thumbnails, a filter for each named guest, a larger original-image viewer, and original downloads. Select up to ten originals per ZIP (up to 100 MiB of source files); ZIPs are assembled in the admin's browser, so use a desktop for large downloads. Thumbnails and originals use short-lived signed URLs; refresh the gallery if its thumbnail links expire. There is no public gallery. Storage/egress usage is billed or limited by your Supabase plan; monitor available storage before inviting everyone to upload.

## Personalize

Edit `src/config/wedding.ts` for names, date/time, venue, map URL, dress code, deadline, palette, and music. The displayed deadline is text; set `rsvpClosesAt` to an ISO timestamp with timezone to actually close submissions. Leave it blank during testing. Change `sampleDetails` to `false` after replacing the sample details.

`public/music/demo.wav` is a small original synthesized arpeggio for testing, generated by `scripts/generate-demo-music.mjs`. Replace it with a licensed MP3 and update `musicUrl`, or set `musicUrl: ''` to omit music and its controls. Audio starts on the envelope tap, with a persistent play/pause control and graceful handling when playback is blocked. Test your chosen track on iOS Safari and Android Chrome. No photos or external animation packages are needed; botanical illustrations are inline SVG and the envelope is CSS. Fonts are self-hosted. Reduced-motion preferences are respected.

## Deploy to Vercel

1. Import this repository into Vercel with the Astro framework preset, Node 24, and build command `npm run build`. The included official adapter produces the static invitation plus server functions.
2. Set all variables from `.env.example` in Vercel’s environment settings. Keep secrets out of Git and redeploy after updates.
3. Shared invitation links and QR codes always use `invitationSiteUrl` in `src/config/wedding.ts`, currently `https://wedding-app-ochre-six.vercel.app`, even when the admin opens a protected preview/deployment URL. After connecting a custom domain, update this setting and redeploy. Previously shared links and downloaded QR images do not change automatically; copy/download them again.
4. Sign in at `/login`, create a test invitation, submit both names, confirm the database/dashboard/email results, update to one attendee, then decline and confirm the total becomes zero. Verify unauthorized admin API calls fail and check email retry behavior. Use separate development/test Supabase projects when practicing.
5. Set uploads to **Open now** in a test project, upload one real photo for each named guest, and verify attribution, thumbnails, original downloads, and a ZIP. Verify an eleventh photo is rejected, a different invitation cannot upload for those guests, and closing uploads hides the button and blocks finalization. Configure the real schedule after testing.
6. Test a phone scan, envelope opening, audio controls, named guest selection, and keyboard navigation before sharing with guests.

This repository is prepared for Vercel. Live credentials belong only in the ignored `.env` and hosting environment settings. The current build uses targeted dependency overrides for patched Vercel transitive dependencies; recheck them when upgrading the adapter. The function duration is bounded at 60 seconds; large photo batches are uploaded sequentially as separate requests.

## Removing invitations and photos

In the guest list, **Remove invitation** removes the entire one- or two-person invitation from the list, totals, and CSV. A confirmation names the people affected. Removal atomically rotates its private token, so the old link/QR cannot read the RSVP, submit changes, or finalize photos. The archived invitation and RSVP remain in the private database; completed memories and their guest names remain in the gallery and guest filter. Unsent notification jobs are removed; email already in flight or delivered cannot be recalled. There is no restore screen.

Use **Remove photo** on a gallery card or in the larger viewer to moderate a completed photo. Confirmation is required. The server hides it from the gallery and new original/ZIP download requests before deleting its original and thumbnail from private Storage. Removal keeps a hidden reservation so still-valid upload tickets and delayed finalizers cannot restore the photo. Use **Release expired slots** after its expiry/grace period to retry failed file deletion and release the slot. Already downloaded or cached copies cannot be recalled. Guests cannot perform either admin removal action.
### Guest confirmation emails

Run `supabase/migrations/006_guest_confirmation_email.sql` once. After each RSVP (and each change), the guest receives a basic confirmation at the email they entered, with their response, their invitation link and 4-digit code. Replies go to `RSVP_EMAIL_TO`. Edit the wording in `src/lib/guest-email.ts`.

Guest emails need `RSVP_EMAIL_FROM` to use a domain you have verified in Resend; Resend's test sender only delivers to your own account address. A guest address that fails 3 times is skipped so it doesn't block the couple's notification retries.
