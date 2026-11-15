import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import webpush from 'web-push';
import messages from './invite-messages.json';

export const INVITE_COOLDOWN_MINUTES = 15;

export type ClientPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const providers = new Set([
  'fcm.googleapis.com',
  'fcmregistrations.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
]);

export function validatedSubscription(raw: unknown): ClientPushSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2048) return null;
  let url: URL;
  try { url = new URL(input.endpoint); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !(providers.has(host) || host.endsWith('.push.apple.com') ||
        host.endsWith('.notify.windows.com'))) return null;
  const keys = input.keys;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const keyFormat = /^[a-zA-Z0-9_-]+$/;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' ||
      p256dh.length < 64 || p256dh.length > 180 || auth.length < 16 || auth.length > 64 ||
      !keyFormat.test(p256dh) || !keyFormat.test(auth)) return null;
  return { endpoint: url.toString(), keys: { p256dh, auth } };
}

export function endpointDigest(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export function randomInvite(sender: string): string {
  return messages[randomInt(messages.length)].replace('{sender}', sender);
}

export function configureWebPush(): void {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error('Missing VAPID push configuration.');
  webpush.setVapidDetails(subject, pub, priv);
}

export { webpush };
