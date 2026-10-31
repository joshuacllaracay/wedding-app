# Chyka & Emmanuel — Wedding invitation

A mobile-first Astro + TypeScript invitation with an animated envelope, optional music, private invitation links and QR codes, RSVP updates, and a private guest dashboard. The colors follow the supplied ivory/champagne/taupe palette.

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

1. Create a Supabase project and run `supabase/schema.sql` **once** in its SQL editor.
2. Copy `.env.example` to `.env` and enter the project URL, anon key, and service-role key. All variables in this project are server-only; never prefix these keys with `PUBLIC_`.
3. In Supabase Authentication, create an email/password user for each person who should manage guests. Add their user UUIDs to the comma-separated `ADMIN_USER_IDS` variable. Disable public sign-ups if you do not need them. The application provides no public registration screen.
4. Restart Astro after changing environment variables. Open `/login`, sign in, then use `/admin` to create invitations with a **one- or two-person allowance**.

The service-role key is used only by server endpoints. Row-level security is enabled with no anonymous or authenticated table access. Admin access requires a verified Supabase Auth session **and** an explicitly allowed user ID. Sessions use HttpOnly, SameSite cookies, become Secure on HTTPS, and expire with the Supabase access token (normally about an hour). Sign in again after expiry; persistent refresh-token storage is intentionally omitted.

## Connect email

1. Create a Resend account and verify a sending domain.
2. Set `RESEND_API_KEY`, `RSVP_EMAIL_FROM` (on that domain), and `RSVP_EMAIL_TO` (the bride and groom’s inboxes, comma-separated).
3. Restart the local server or redeploy after changing environment variables.

An RSVP is saved transactionally with a notification-outbox entry before the email is attempted. Email failures do not lose the RSVP. The dashboard shows unsent notifications and can retry ten at a time. Retries use atomic leases and Resend idempotency keys to avoid simultaneous sends. A notification interrupted during sending becomes retryable after five minutes. Resend’s idempotency retention is finite, so an ambiguous delivery retried much later may produce a duplicate email; it cannot duplicate the saved headcount. There is no automatic background retry job in this version. “Sent” means the provider accepted the message, not guaranteed inbox placement.

## Guest workflow

1. In `/admin`, enter an invitation name (for example, “Alex & Sam”) and allowance (1 or 2).
2. Copy the generated private link or download its QR code. Each QR encodes that invitation’s URL: `/?invite=<random-UUID>`.
3. Share that link/QR with the invited person. The recipient chooses attending/declining, enters their name and email, selects one or two attendees within the allowance, and writes a message or reason.
4. The same private link lets them update their existing response. Counts reflect the latest saved response. Identical resubmissions are idempotent; changed responses are limited to one every ten seconds per invitation.
5. View confirmed **people**, accepting/declining **invitations**, and unanswered invitations in the dashboard. Search by name/email or export the full list as CSV.

Private links are bearer credentials: anyone holding one can read and update that invitation’s response, including its contact email and message. Share them directly. If one leaks, use **Replace link** in the dashboard, then share its new link/QR. The old link stops working and the RSVP is retained. Avoid third-party analytics that capture invitation URLs. Referrer policy prevents links leaking to other sites through the Referer header. Guests’ RSVP data is private; the invitation’s general wedding details are publicly accessible at `/`.

## Personalize

Edit `src/config/wedding.ts` for names, date/time, venue, map URL, dress code, deadline, palette, and music. The displayed deadline is text; set `rsvpClosesAt` to an ISO timestamp with timezone to actually close submissions. Leave it blank during testing. Change `sampleDetails` to `false` after replacing the sample details.

`public/music/demo.wav` is a small original synthesized arpeggio for testing, generated by `scripts/generate-demo-music.mjs`. Replace it with a licensed MP3 and update `musicUrl`, or set `musicUrl: ''` to omit music and its controls. Audio starts on the envelope tap, with a persistent play/pause control and graceful handling when playback is blocked. Test your chosen track on iOS Safari and Android Chrome. No photos or external animation packages are needed; botanical illustrations are inline SVG and the envelope is CSS. Fonts are self-hosted. Reduced-motion preferences are respected.

## Deploy to Vercel

1. Import this repository into Vercel with the Astro framework preset, Node 24, and build command `npm run build`. The included official adapter produces the static invitation plus server functions.
2. Set all variables from `.env.example` in Vercel’s environment settings. Keep secrets out of Git and redeploy after updates.
3. Use the final HTTPS/custom domain **before** generating and sharing QR codes. Codes made on localhost only work on that machine.
4. Sign in at `/login`, create a test invitation, submit two attendees, confirm the database/dashboard/email results, update to one attendee, then decline and confirm the total becomes zero. Verify unauthorized `/api/admin` calls fail and check email retry behavior. Use separate development/test Supabase projects when practicing; the production dashboard has no delete feature.
5. Test a phone scan, envelope opening, audio controls, one/two-person selection, and keyboard navigation before sharing with guests.

This repository is prepared for Vercel but is not deployed and contains no live credentials. The current build uses targeted dependency overrides for patched Vercel transitive dependencies; recheck them when upgrading the adapter.
