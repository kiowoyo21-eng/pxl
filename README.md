# PXL · Pixel Character Collection (Installable PWA)

**Standalone Next.js App Router PWA.** A collectible modern/retro RPG coin gallery with 1–3 letter usernames and live, temporary Telegram-mobile-inspired chat.

**This is a ZIP handoff.** This revision does not write to GitHub, Vercel, or Supabase. It can be installed in your existing PXL repository or another account. The ZIP contains no live credentials.

## PXL V1.3 — game UI + ephemeral media

- **Rebranded as PXL** across login, gallery, chat, error screen, web metadata, browser title, and visual preview.
- **Installable web app manifest** at `app/manifest.ts`, `display: standalone`, scope `/`, dark theme `#0e1621`.
- **Pixel character inside a metallic PXL coin icon** in 192×192, 512×512, 512×512 maskable, 180×180 Apple touch, and favicon sizes.
- **Install PXL** button on the sign-in screen and collection navigation. Uses native Chrome/Edge prompts when offered, with Safari/iOS and fallback instructions.
- **Service worker** (`public/sw.js`) for install lifecycle ONLY. It does not intercept requests, pre-cache an offline shell, save responses, store messages, register background sync, or deliver notifications. No cached chat data.
- Standalone iPhone/iPad home-screen metadata; responsive mobile chat fills the screen. Login remains cookie-based; chat state remains RAM-only.

### Installing PXL on a phone or desktop

After deployment to **HTTPS**, open the website:

- **Android / Chrome:** tap **Install PXL**, or browser menu → **Install app** / **Add to Home screen**.
- **iPhone / Safari:** tap **Share** → **Add to Home Screen** → **Add**. Safari doesn't support the Chrome install prompt; PXL provides on-screen instructions.
- **Desktop / Chrome or Edge:** use **Install PXL** when the prompt is supported, or the browser's Install icon/menu.
- **Locally:** `http://localhost:3000` works for testing. Other devices on your LAN generally need HTTPS to use service workers and install reliably.

**Offline behavior:** PXL requires an active connection for login, loading the roster, Realtime Presence, and live chat. **No offline chat, chat queue, chat caching, or notifications.** A PWA can still be installed even if live app functionality requires internet. If the browser itself retains HTTP or operational traces, a service worker cannot guarantee their erasure; this app sets `Cache-Control: no-store` and does not add its own caches.

### New in V1.3

- **Game-first roster:** removed `Choose your character`, counters, `CHARACTER ARCHIVE / VOL. 01`, `COLLECTOR`, `10/TOKEN` / `CHARACTER TOKEN` / `YOUR TOKEN`, footer marketing and chat-history notices. Coin sprites, usernames, presence dots, sorting, PIN login and PWA stay intact.
- **Offline tap feedback:** gray-dot coins show a 2.6-second toast; no chat opens. Own coin is still disabled.
- **Disappearing photos:** select from camera/gallery, then a full-photo preview opens. A *small lower-left timer control* appears only after selection; choose 3, 10, or 20 seconds (default 10s). Recipient taps to view once. The timer begins upon opening; closing, backgrounding or expiry removes the photo from PXL memory and notifies sender when the peer connection is active. No image URL is uploaded to cloud storage.
- **Voice messages:** on touch devices, press and hold the mic, release to send, slide left to cancel; on desktop click the mic to start/stop. Recording is capped at 60 seconds. Recipients can replay the audio while that chat stays open. Voice blobs and microphone tracks are released on Back/refresh/close.
- **Media transmission:** photos and voice go over encrypted **WebRTC DataChannels** in 16 KB chunks. Supabase Realtime Broadcast is used for temporary SDP/ICE signaling, and the original text chat remains Broadcast-based. The system uses no media database, Storage bucket, uploads or offline queue.
- **Compatibility:** a WebRTC connection must be established on both clients before attachments can be sent; text can work even when media P2P fails. Only a public STUN server is configured; some mobile-carrier/corporate NATs require TURN. No TURN service or persisted media relay is included in this ZIP.

## Included

- Next.js 16 / React 19 / TypeScript and responsive dark UI (`#0e1621`, `#17212b`, `#232e3c`, `#f5f5f5`, `#5288c1`).
- Deterministic 16-bit-inspired pixel characters minted inside metallic-rim coins, with colorful centers. Username is the seed, so the sprite is stable across visits.
- Discreet green/gray presence dot **only**, no visible online/offline labels. Your coin is labeled `YOU` and cannot be selected. Offline characters remain visible and tapping one shows a brief unavailable toast.
- In-memory frequent-contact ordering **per loaded page**. Successful sent/received messages increment it. Sorting changes after returning to the wall and completely resets on browser refresh. No user-contact metadata in the database or browser storage.
- Auto-join/create username flow (case insensitive, **1–3 letters A–Z**); 6-digit PIN login; server-side HMAC pepper + bcrypt hashing; `HttpOnly`, `SameSite=Lax`, `Secure` (production) 7-day session cookie; 5 wrong PIN attempts lock the account for 15 minutes.
- Admin-only PIN reset CLI that revokes existing sessions.
- Supabase Realtime **Presence** to indicate connected characters, **Broadcast** for direct messages; mutual connected chat-room presence required before sending; invite prompt for recipient.
- No messages table or chat API. Chat exists only as React state, is removed on Back, and disappears on refresh or tab close. Pictures/voice and related object URLs are also cleaned up on chat exit. No `localStorage` or `sessionStorage` for chats. Login persists because of the separate `HttpOnly` session cookie.

## Try the design without any account

Open `PREVIEW.html` in a browser. It is an **offline visual demo** with mock character coins and a nonfunctional phone chat view. It does not connect to Supabase, send messages, or require npm. The actual app starts through Next.js once set up.

## Setup in the other Supabase account

1. Create an **empty, separate Supabase project**. Do **not** run the SQL against any existing work or production project.
2. In that project's **SQL Editor**, review and run `supabase/migrations/202611110001_collection_setup.sql` once. It creates only the two new `public.collection_*` tables and one auth-rate-limit function. It grants no public client access to the tables; it deliberately creates no chat table.
3. In **Realtime Settings**, make sure **public channel access is enabled**. This is required by the basic Broadcast/Presence option you selected. You do not need to publish a database table for Postgres Changes.
4. Copy `.env.example` to `.env.local` and fill credentials from **the other project**:
   - `NEXT_PUBLIC_SUPABASE_URL`: project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public `sb_publishable_...` key
   - `SUPABASE_SECRET_KEY`: **server-only** `sb_secret_...` key. **Never** publish it or give it a `NEXT_PUBLIC_` prefix.
   - `PIN_PEPPER`: random, private **32+ character** value generated via `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
5. Install Node.js 20.9+ (recommended Node 22). In this folder run:

   ```sh
   npm install
   npm run dev
   ```

6. Open `http://localhost:3000` in two different browsers or devices, register two usernames, and use both at the same time. The green presence dot indicates a client whose page is open/visible. A starts a chat → B sees an invite → B accepts → both can send live text. Once the peer-to-peer connection is ready, try a photo and a voice recording on two real devices. Both devices require HTTPS for microphone access unless using localhost. Back/refresh wipes each tab's messages and in-memory media.
7. For a deployment, set the four environment variables **on your chosen hosting provider**, enable HTTPS, set secure proxy/origin handling, and run `npm run build` and `npm start` (Node server required; static export is **not** supported).

### Admin-only PIN reset

Run this privately from the project directory in an environment with your server credentials:

```sh
node --env-file=.env.local scripts/reset-pin.mjs ABC 123456
```

Change `ABC` and `123456`. It changes the PIN verifier and invalidates that member's sessions. It does not delete the account. **Never expose this script as a public endpoint.** If a PIN is forgotten, only an authorized operator with server secret credentials can reset it.

### Quick tests

```sh
npm test
npm run typecheck
npm run build
```

## Important security and privacy limitations

**Basic public Broadcast is NOT confidential messaging.** As requested, these are **public** Supabase Realtime channels, not private RLS-protected channels. Someone with the public project key and knowledge of channel topics could subscribe to messages, observe invites, or impersonate presence. The 1–3 character username and 6-digit PIN are not strong identifiers; per-account lockout slows guessing but does not replace IP-/network-level abuse controls. WebRTC encrypts media in transit, but the SDP/ICE signaling on these public channels can be observed or tampered with; an attacker could mount a man-in-the-middle attack. WebRTC ICE candidates may expose network information. Do not send sensitive photos or voice recordings in this mode. Before a sensitive/public launch, change to private authenticated Realtime channels with validated authorization, introduce platform-wide rate limiting/bot controls, and consider stronger authentication. Do not use this version for private, regulated, or high-risk conversations.

**Zero app history ≠ guaranteed zero infrastructure/device traces.** This app intentionally does not insert messages into any table, file, analytics, local storage, session storage, or server log; however, Realtime/hosting providers may retain operational telemetry, browser/device memory can linger, recipients can screenshot, screen-record or save photo/audio data, and browser/OS/network tools may observe traffic. Photo timers and the no-history policy cannot block external saving or guarantee instantaneous device-level deletion. No technical design can promise instant physical erasure from RAM at tab close. "Zero trace" here means **no application-controlled persistence of chat content**.

- Supabase's Realtime internal system and observability are managed by Supabase; this ZIP does not claim to alter provider retention.
- Presence status is a connection/visibility indicator, not a verified human activity signal. In public mode it is not identity-authenticated.
- The username-exists check intentionally reveals whether a short name is registered, as specified.
- Accounts/sessions and failed-login counters are persisted; chat and frequent-contact ranking are not.
- **No 5-year account deletion archive** is implemented (that later instruction was explicitly withdrawn).
- For a busy site, replace the 1,000-member roster query with paginated server requests; the current 1,000 cap is to guard oversized responses.
- PIN lockout is per account. Add global request rate limiting at the reverse proxy/hosting layer before a wide public launch.
- Publicly accessible Realtime invites and payloads are not end-to-end encrypted. This matches the explicitly chosen basic Broadcast option.
- Cross-origin writes are rejected via the browser Origin check; configure deployment URL/proxy accordingly.
- App uses Google Fonts CSS (optional visual enhancement), which may require external requests; remove the import if offline/self-hosting is essential.

## File map

```
app/             Next.js page, PWA manifest, favicon, error boundary, styling, server API routes
components/      pixel-coin.tsx (sprites), collection-app.tsx (roster), ephemeral-chat.tsx (chat + media UI), pwa-install-button.tsx
lib/             auth/session logic, validation, peer-media.ts (WebRTC transport), Supabase clients
supabase/migrations/   SQL tables + RLS + auth counter function
scripts/reset-pin.mjs   admin-only reset utility
tests/           static privacy/structural/PWA/media checks
public/icons/    PXL icon set; public/sw.js is intentionally network-only
PREVIEW.html     standalone, nonfunctional visual preview
.env.example     placeholder configuration only
```

**Dependencies are exact-version pinned, including Next.js 16.4.6.** This offline build environment could not reach npm, so a verified `package-lock.json` and installed-dependency build could not be generated. Run `npm install` in a connected environment to resolve the dependency tree and generate the lockfile, then commit/retain that lockfile in your other account before production deployment. The included local smoke tests do not substitute for integration testing with your new Supabase project.

### V1.3 validation checklist (two separate devices/tabs)

1. Confirm username + PIN registration/login works, then open two accounts with both tabs visible.
2. Gray-dot coin: tap it, check toast appears without changing page. Green-dot coin: tap, recipient accepts invite.
3. Send/receive text; go Back and re-open — no old messages. Refresh — in-memory contact ranking also resets.
4. Choose an image; verify the timer popup is **only** in photo preview, select 3s / 10s / 20s, then send. Receiver taps once, timer counts down; after expiry it cannot be reopened. The sender sees the photo placeholder disappear when expiration is received.
5. Start a voice message, release/stop to send. Play twice in receiver chat. Verify return-to-roster and refresh erase all audio playback URLs.
6. Deny microphone permission, switch tabs while viewing a timed photo, and test on iOS Safari and Android Chrome. Test across different networks, including mobile data; without TURN, media may not connect on some networks.
7. Test `npm test`, `npm run typecheck`, and `npm run build` with installed dependencies. The authoring environment could run static/syntax tests but not download npm packages or perform a real two-client Supabase/WebRTC end-to-end test.

**No new Supabase migration is needed for V1.3.** Media is transported peer-to-peer and never inserted into a new table. Do not create an image/voice Storage bucket for this feature.
