import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_AGE_SECONDS, checkPin, createSession, sameOrigin, NO_STORE } from '@/lib/auth';
import { getServerDatabase } from '@/lib/supabase-server';
import { normalizeUsername, validPin } from '@/lib/validation';
import { readJsonObject, fail } from '@/lib/http';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Request origin is not allowed.', 403);
  const body = await readJsonObject(req);
  const username = normalizeUsername(body?.username);
  if (!username || !validPin(body?.pin)) return fail('Use 1–3 letters and a 6-digit PIN.', 400);

  try {
    const db = getServerDatabase();
    const { data: member, error } = await db.from('collection_members')
      .select('id,username,created_at,pin_hash,failed_attempts,locked_until')
      .eq('username', username).maybeSingle();
    if (error) return fail('Sign-in is temporarily unavailable.', 503);
    if (!member) return fail('Name not found. Create a character instead.', 404);

    if (member.locked_until && Date.parse(member.locked_until) > Date.now()) {
      return fail('Too many attempts. Try again in 15 minutes or ask the administrator to reset your PIN.', 429);
    }

    const correct = await checkPin(body.pin, member.pin_hash);
    if (!correct) {
      // The database function increments failures atomically (5 wrong attempts → 15 minute lock).
      const { error: attemptError } = await db.rpc('collection_record_failed_pin', { p_member_id: member.id });
      if (attemptError) return fail('Sign-in is temporarily unavailable.', 503);
      return fail('Incorrect PIN. Please try again.', 401);
    }
    const { error: resetError } = await db.from('collection_members')
      .update({ failed_attempts: 0, locked_until: null }).eq('id', member.id);
    if (resetError) return fail('Sign-in is temporarily unavailable.', 503);
    const token = await createSession(member.id);
    const response = NextResponse.json({ member: {
      id: member.id, username: member.username, created_at: member.created_at
    } }, { headers: NO_STORE });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      maxAge: SESSION_AGE_SECONDS
    });
    return response;
  } catch {
    return fail('Service is not configured or temporarily unavailable.', 503);
  }
}
