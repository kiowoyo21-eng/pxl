import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('exactly 100 distinct invitation lines with a sender marker', () => {
  const messages = JSON.parse(file('lib/invite-messages.json'));
  assert.equal(messages.length, 100);
  assert.equal(new Set(messages).size, 100);
  assert.ok(messages.every(x => x.startsWith('{sender}') && x.length < 180));
  assert.match(file('lib/push.ts'), /randomInt\(messages\.length\)/);
});

test('push is recipient opt-in, invited sender is authenticated, and recipients are rate-limited', () => {
  const sub = file('app/api/push/subscription/route.ts');
  const invite = file('app/api/push/invite/route.ts');
  const button = file('components/push-invites-button.tsx');
  assert.match(button, /Notification\.requestPermission\(\)/);
  assert.match(button, /pushManager\.subscribe/);
  assert.match(button, /pushManager\.getSubscription/);
  assert.match(sub, /getSessionMember\(request\)/);
  assert.match(sub, /sameOrigin\(request\)/);
  assert.match(invite, /getSessionMember\(request\)/);
  assert.match(invite, /sameOrigin\(request\)/);
  assert.match(invite, /randomInvite\(sender\.username\)/);
  assert.match(invite, /next_allowed_at/);
  assert.match(invite, /\.lte\('next_allowed_at'/);
  assert.match(invite, /TTL: 600/);
});

test('new database tables are server-only and never persist chat or contact pairs', () => {
  const sql = file('supabase/migrations/202611150001_push_invitations.sql');
  assert.match(sql, /create table if not exists public\.collection_push_subscriptions/);
  assert.match(sql, /create table if not exists public\.collection_push_invite_budget/);
  assert.match(sql, /alter table public\.collection_push_subscriptions enable row level security/);
  assert.match(sql, /revoke all on public\.collection_push_subscriptions from public, anon, authenticated/);
  assert.doesNotMatch(sql, /\bsender_id\b|\binvitation_body\b|\bchat_message\b/);
});

test('service worker handles push and notification click without chat cache or fetch hooks', () => {
  const sw = file('public/sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification\('PXL'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.doesNotMatch(sw, /addEventListener\('fetch'|caches\.open|cache\.put|indexedDB|localStorage/);
});

test('offline coins send invitations and sender never chooses their own display name', () => {
  const app = file('components/collection-app.tsx');
  assert.match(app, /!onlineIds\.has\(member\.id\)/);
  assert.match(app, /'\/api\/push\/invite'/);
  assert.match(app, /targetId: member\.id/);
  assert.match(app, /<PushInvitesButton\s*\/>/);
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
});
