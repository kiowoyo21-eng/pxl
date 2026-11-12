# PXL V1.3 — Consolidated Revision QA (2026-11-12)

## Scope
- Game-first UI cleanup; no token, archive, collector or chat-history marketing labels in visible application screens
- Gray-dot coin tap shows temporary unavailable toast; coin appearance unchanged
- Photo picker -> full photo preview -> small bottom-left 3 / 10 / 20 second selector; one view on recipient side, countdown on open, automatic expiry
- In-memory voice recording and replay; mobile hold/release, desktop tap start/stop, 60-second maximum
- Encrypted WebRTC DataChannel for photo/voice binary transfer, Supabase Broadcast for SDP/ICE signaling only
- No new database tables, Storage buckets, message history, analytics, browser caches or persistent client-side chat storage
- Previous Supabase authentication/session, PWA install and roster ranking retained

## Automated checks run locally
- Node test runner `node --test tests/*.test.mjs`: **10/10 PASS**
- TypeScript/TSX syntax transpilation across source files using installed global TypeScript: **0 syntax errors**
- `PREVIEW.html` inline script syntax check: **PASS**
- Source static review: **no storage or media upload API** for conversations; **same SQL migration** and server-side auth code as V1.2
- Base source matches the GitHub repository's previously read `main` file blob SHAs (collection-app.tsx / globals.css / package.json)

## Not yet verified
- End-to-end live two-device WebRTC ICE setup and binary media delivery: requires real online Supabase/HTTPS and two browsers
- Full Next.js build/typecheck with installed dependencies: npm registry was unreachable from this build environment (`EAI_AGAIN`)
- All microphone permission paths and camera/gallery behavior on production iOS Safari, Android Chrome, and desktop browsers
- WebRTC connectivity across strict mobile-carrier/corporate NAT: STUN-only; a TURN relay might be needed
- Deployment on Vercel: unchanged (connected GitHub permission is read-only; no remote commits made)

## Security limitations
- Basic **public** Supabase Broadcast channels remain as previously chosen, which means SDP/ICE signaling and text chat are **not identity-authenticated or confidential** against malicious channel participants. WebRTC media transport is encrypted, but untrusted signaling may permit MITM attacks. Do not treat as a private photo vault.
- In-memory disappearing photos and voice recordings can be captured externally (screenshots, screen recording, recording the audio, device/browser telemetry), and some browser/network traces may remain. The app intentionally does not create application-controlled persistent media/chat copies.
- The sender's timer limits viewing inside the recipient's PXL app only. The media must first arrive while both clients are actively connected; there is no offline media delivery.

## Files changed from V1.2
- `components/collection-app.tsx` (roster/UI cleanup)
- `components/ephemeral-chat.tsx` (new, chat and photo/voice UI)
- `lib/peer-media.ts` (new, WebRTC transport)
- `app/globals.css` (UI styling)
- `tests/structure.test.mjs` (expanded to 10 smoke tests)
- `PREVIEW.html` (offline visual preview updated)
- `README.md`, `package.json` (documentation/version only; dependency versions unchanged)
- `QA_REPORT_V1_3.md` (this report)
