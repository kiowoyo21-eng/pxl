# PXL V1.4 — QA and change log

Date: 2026-11-12

## Scope

1. Exclude the signed-in member from character coin grid (including no YOU card).
2. Add a real camera flow with permission prompt, video preview, shutter capture, camera flip, and camera track cleanup. Gallery upload remains an independent option.
3. Replace server Permissions-Policy that previously denied camera and microphone for all pages.
4. Use a modal history entry for an opened disappearing photo so phone Back/swipe-back returns to chat rather than clearing messages. Photo still expires on closure, timeout or tab visibility loss.
5. No changes to Supabase SQL, PIN/auth code, message persistence, or timer choices.

## Verification run

- Local Node smoke tests: see `npm test` (13 tests); all passed in packaging environment.
- TypeScript/TSX syntax: parsed/transpiled using system TypeScript compiler; no parser diagnostics.
- Full npm build: **not run** (npm dependency registry unavailable).
- Live two-device camera/mic/WebRTC: **not run** (no live project credentials/device access).
- ZIP integrity and changed-files baseline: verified while packaging.

## Required manual QA after deploy

1. Register/login as A; coin grid must not show A. Login as B in second browser/device; A should see B and vice versa.
2. B offline: tap coin -> toast; B online: open chat.
3. Tap media icon -> Take Photo and Upload Photo. The first camera tap should prompt permission if never granted; take picture and see photo preview + 3/10/20-second timer.
4. Deny camera; verify error and that app remains usable. Grant permission, flip camera, capture; confirm camera indicator stops after capture/close.
5. Tap microphone; browser requests permission on first use, record and stop; verify replay while chat open. Deny and check recoverable message.
6. Receive photo, open viewer, use physical/software Back and close button; underlying chat must still contain earlier messages. Timer expiry should remove photo only.
7. Chat Back exits to roster and clears all chat state; refresh clears in-memory ranking; login remains.
8. Verify response header `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`; ensure HTTPS.

## Limitations

Never assume secure/private messaging from public Supabase Broadcast. Browser/device screenshots and recordings cannot be prevented. Media transport may not connect across some NATs without TURN.
