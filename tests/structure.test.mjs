import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('SQL has no message-history table and requires RLS for identities and sessions', () => {
  const sql = file('supabase/migrations/202611110001_collection_setup.sql');
  assert.match(sql, /create table if not exists public\.collection_members/);
  assert.match(sql, /create table if not exists public\.collection_sessions/);
  assert.match(sql, /alter table public\.collection_members enable row level security/);
  assert.match(sql, /alter table public\.collection_sessions enable row level security/);
  assert.doesNotMatch(sql, /create table[^;]*(?:chat_messages|conversation_messages)/i);
});

test('chat uses Realtime Broadcast and disappears on component unmount', () => {
  const code = file('components/collection-app.tsx');
  assert.match(code, /event: 'message'/);
  assert.match(code, /type: 'broadcast'/);
  assert.match(code, /setActivePeer\(null\)/);
  assert.match(code, /removeChannel\(channel\)/);
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|sendBeacon|console\.log/);
});

test('account credentials never flow into browser Supabase client', () => {
  assert.match(file('lib/supabase-browser.ts'), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(file('lib/supabase-browser.ts'), /SUPABASE_SECRET_KEY|PIN_PEPPER/);
  assert.match(file('lib/auth.ts'), /createHmac\('sha256'/);
  assert.match(file('lib/auth.ts'), /httpOnly:|COOKIE_NAME/);
  assert.match(file('app/api/auth/login/route.ts'), /collection_record_failed_pin/);
});

test('avatar design and username restrictions are stable', () => {
  assert.match(file('components/pixel-coin.tsx'), /stableSeed\(username: string\)/);
  assert.match(file('components/pixel-coin.tsx'), /coin-presence/);
  assert.match(file('lib/validation.ts'), /\{1,3\}/);
  assert.match(file('lib/validation.ts'), /\{6\}/);
});
