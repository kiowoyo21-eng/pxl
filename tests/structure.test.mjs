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

test('chat uses Realtime Broadcast, RAM-only media transfer and cleanup on unmount', () => {
  const roster = file('components/collection-app.tsx');
  const chat = file('components/ephemeral-chat.tsx');
  const media = file('lib/peer-media.ts');
  assert.match(chat, /event: 'message'/);
  assert.match(chat, /type: 'broadcast'/);
  assert.match(roster, /setActivePeer\(null\)/);
  assert.match(chat, /removeChannel\(channel\)/);
  assert.match(chat, /URL\.revokeObjectURL/);
  assert.match(chat, /getUserMedia/);
  assert.match(chat, /MediaRecorder/);
  assert.match(media, /RTCPeerConnection/);
  assert.match(media, /createDataChannel/);
  assert.match(media, /CHUNK_BYTES = 16 \* 1024/);
  assert.doesNotMatch(roster + chat + media, /localStorage|sessionStorage|indexedDB|sendBeacon|console\.log/);
});

test('game UI has no marketing or token labels, and offline coins notify', () => {
  const roster = file('components/collection-app.tsx');
  assert.doesNotMatch(roster, /CHARACTER ARCHIVE|VOL\. 01|COLLECTOR|NO CHAT HISTORY|CHARACTER TOKEN|YOUR TOKEN|\/ TOKEN|Choose your/);
  assert.match(roster, /setNotice\(\`\$\{member\.username\}/);
  assert.match(roster, /role="status"/);
  assert.match(roster, /disabled=\{isSelf\}/);
});

test('photo timers are only in post-selection preview, with 3s 10s 20s and one-view expiry', () => {
  const chat = file('components/ephemeral-chat.tsx');
  const media = file('lib/peer-media.ts');
  assert.match(chat, /photo-preview-overlay/);
  assert.match(chat, /photo-duration-menu/);
  assert.match(chat, /\(\[3, 10, 20\] as const\)/);
  assert.match(chat, /const \[duration, setDuration\] = useState<PhotoDuration>\(10\)/);
  assert.match(chat, /expirePhoto\(viewing\.id, true\)/);
  assert.match(media, /validPhotoDuration/);
  assert.doesNotMatch(media, /supabase\.storage|\.from\('messages'\)/);
});

test('voice is replayable while chat exists, 60s maximum and no audio database', () => {
  const chat = file('components/ephemeral-chat.tsx');
  assert.match(chat, /MAX_RECORDING_MS = 60_000/);
  assert.match(chat, /<VoiceBubble/);
  assert.match(chat, /recorder\.start\(250\)/);
  assert.match(chat, /recorderRef\.current\.stop\(\)/);
  assert.match(chat, /streamRef\.current\?\.getTracks\(\)/);
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
