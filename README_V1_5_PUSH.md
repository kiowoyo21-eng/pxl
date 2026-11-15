# PXL V1.5 — Offline Coin Invitations

**Requires explicit configuration before it can deliver notifications.** The user has to run the new SQL on their separate PXL Supabase account and set VAPID environment variables in the PXL Vercel project; these changes are NOT performed automatically and no connected accounts were touched.

## What changed

- Green-dot character: opens the usual ephemeral chat.
- Gray-dot character: sends a **push invitation request** when tapped; the sender receives a toast. If no subscription is saved, shows a graceful notice.
- 100 game-first invite phrases, random server-side selection. Examples:
  - `LYD is inviting you to explore.`
  - `LYD found a new adventure for you.`
  - `LYD just unlocked an invitation for you.`
- Each user can choose **ENABLE INVITES** in the PXL header. The browser asks for notification permission only when they tap it. Tapping again turns invitations off on that device.
- Push invitations can appear after the recipient closes the app, subject to the OS/browser and notification permission. It does **not** enable offline chat or offline message delivery.
- Notifications are NOT chat messages or a chat queue. PXL retains no chat content.

## Setup steps (for the user's other accounts)

1. Merge the patch ZIP into the root of your existing PXL code (or use the full ZIP).
2. Run SQL file `supabase/migrations/202611150001_push_invitations.sql` **only** in the intended PXL Supabase project's SQL Editor, after `202611110001_collection_setup.sql`.
3. Generate a fresh VAPID key pair. **No terminal needed:** open `tools/GENERATE_VAPID_KEYS_OFFLINE.html` in a local Chrome/Edge browser and click **Generate new push keys**. Alternatively, from a terminal: `npx web-push generate-vapid-keys`.
4. In Vercel → PXL → Settings → Environment Variables (Production), add:
   - `VAPID_PUBLIC_KEY` = generated public key
   - `VAPID_PRIVATE_KEY` = matching private key (secret; never publish)
   - `VAPID_SUBJECT` = `mailto:your-real-contact-email@example.com`
5. Ensure the existing PXL `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `PIN_PEPPER` are still configured; no changes are needed to them.
6. Deploy updated code (e.g., push using **your own** writable GitHub account). Vercel should install `web-push` (version 3.6.7) and its types; regenerate `package-lock.json` using `npm install`, and commit the new lockfile.
7. For each recipient: open PXL, sign in, tap **ENABLE INVITES**, grant OS/browser notification permission. On iPhone/iPad, PXL must be installed to Home Screen first, then opened as the installed app. Desktop Chrome/Edge and supported Android browsers can enable push through the browser.
8. Leave recipient PXL page (so the gray dot appears to the sender), then have the sender tap that character. On a subscribed device a game invitation notification can appear even if the PXL window is closed. Tapping it opens/focuses PXL, but doesn't restore old chats.

## Limitations and abuse prevention

- Global **one delivered-attempt per recipient per 15 minutes** rate limit, regardless of sender. This prevents spam while keeping no sender/recipient interaction history.
- The push provider may hold the invitation for up to **10 minutes** (TTL = 600 seconds). Past messages/photos/voice are never queued or stored.
- No notification can be delivered to a recipient who has not opted in or whose device is unsupported or offline beyond TTL.
- A sent response is provider acceptance, not proof that a user viewed the notification.
- Device push endpoint + public encryption key + auth key, and a per-recipient cooldown timestamp, must be saved server-side. No message history or frequent-contact rankings are stored.
- Push notification banners/notification centers are controlled by the OS and cannot be wiped by PXL. This feature therefore cannot claim absolute zero trace.
- Server validates subscription endpoints against mainstream push providers to reduce SSRF risk; other providers may need review to be supported.
- The server trusts the client's presence snapshot to decide whether a gray-dot coin was tapped; recipient-level cooldown still applies to prevent repeated sends.

## QA

Run `npm install`, `npm test`, `npm run typecheck`, and `npm run build` in your normal environment. Local offline source tests: **18 pass**. Live device testing required.

No GitHub, Supabase, or Vercel account was modified in preparing this revision.
