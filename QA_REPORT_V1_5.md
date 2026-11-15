# PXL V1.5 — Offline Game Invitations QA

**Scope:** Offline coin taps can request Web Push notifications to subscribed devices with a random selection from 100 game-style invite lines. Changes are confined to PXL frontend, server API, service worker, separate push schema migration, and push dependencies.

## Verification completed

- 100 unique templates in `lib/invite-messages.json`; each uses `{sender}`.
- Random server-side selection via `crypto.randomInt` with authenticated sender username.
- No sender-controlled message text in the API. No push of photo/audio/message content.
- Recipient explicit opt-in, device subscription persisted server-side; disable control included.
- Server verifies same-origin and existing PXL session on write actions.
- Push recipient includes subscribed devices only; no recipient subscription returns gracefully.
- Atomic, recipient-wide 15-minute push cooldown in database without recording who invited whom.
- HTTP push TTL 600 seconds (the push provider may queue for up to that period).
- Service worker shows notifications and opens/focuses PXL; no fetch interception, no response/message caching.
- Base PXL chat / roster / camera / voice behavior kept as before.
- `node --test tests/*.test.mjs` **18/18 pass**.
- Zip CRC checks passed.

## Not verified here

- Full Next.js npm production build: npm dependency resolution timed out in this isolated environment; requires testing with network-accessible npm registry.
- Live Supabase migration and Web Push delivery: user must run the separate SQL migration, set VAPID vars, then test two devices; no connected accounts were changed.
- Push providers and browser support vary by platform. On iPhone/iPad, the PWA must be added to Home Screen and notification permission must be granted.

## Privacy trade-off

Web Push inherently requires durable push subscription endpoint/keys in `collection_push_subscriptions`; the only invitation activity data persisted is a recipient-level `next_allowed_at` cooldown. **No conversation contents, sender/recipient pair records, invitation text, messages, pictures, or voice files** are stored by PXL. Push services and operating systems may retain notification payloads outside PXL's control. This is not absolute zero-trace.

## Safety & behavior

- A public repository MUST NOT contain `VAPID_PRIVATE_KEY` or any Supabase secret.
- Existing V1.4 Supabase migration remains unchanged; execute the new migration after it.
- Existing `PIN_PEPPER` is unaffected.
- Sent/queued does not confirm the recipient device actually displayed a notification.
- The online presence dot is a client snapshot; server rate limits invites but does not independently assert whether the recipient was online at send time.
