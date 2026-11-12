/**
 * Admin-only local CLI. Never deploy this script as a browser route.
 * Example: node --env-file=.env.local scripts/reset-pin.mjs ACE 123456
 * Requires secret key + PIN_PEPPER. Revokes all sessions for the affected member.
 */
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const [usernameRaw, pin] = process.argv.slice(2);
const username = usernameRaw?.trim().toUpperCase();
if (!username || !/^[A-Z]{1,3}$/.test(username) || !/^\d{6}$/.test(pin || '')) {
  process.stderr.write('Usage: node --env-file=.env.local scripts/reset-pin.mjs ABC 123456\n');
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const pepper = process.env.PIN_PEPPER;
if (!url || !secret || !pepper || pepper.length < 32) {
  process.stderr.write('Missing server credentials / PIN_PEPPER.\n');
  process.exit(2);
}
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: member, error: memberError } = await db.from('collection_members')
  .select('id').eq('username', username).maybeSingle();
if (memberError || !member) {
  process.stderr.write('No matching member or database unavailable.\n');
  process.exit(1);
}
const digest = createHmac('sha256', pepper).update(pin).digest('hex');
const hash = await bcrypt.hash(digest, 12);
const { error } = await db.from('collection_members')
  .update({ pin_hash: hash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
  .eq('id', member.id);
if (error) {
  process.stderr.write('PIN reset failed.\n');
  process.exit(1);
}
const { error: revokeError } = await db.from('collection_sessions')
  .delete().eq('member_id', member.id);
if (revokeError) {
  process.stderr.write('PIN changed, but session revocation failed! Manually revoke sessions.\n');
  process.exit(1);
}
process.stdout.write(`PIN changed and sessions revoked for ${username}.\n`);
