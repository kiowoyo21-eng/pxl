import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_AGE_SECONDS, createSession, makePinHash, sameOrigin, NO_STORE } from '@/lib/auth';
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
    const pin_hash = await makePinHash(body.pin);
    const { data: member, error } = await db.from('collection_members')
      .insert({ username, pin_hash }).select('id,username,created_at').single();
    if (error?.code === '23505') return fail('That character name is taken. Enter its PIN to log in.', 409);
    if (error || !member) return fail('Could not create this character. Please retry.', 503);
    try {
      const token = await createSession(member.id);
      const response = NextResponse.json({ member }, { status: 201, headers: NO_STORE });
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
        maxAge: SESSION_AGE_SECONDS
      });
      return response;
    } catch {
      // Account still exists if session write fails; user can log in with their PIN.
      return fail('Character created, but sign-in failed. Please log in with your PIN.', 503);
    }
  } catch {
    return fail('Service is not configured or temporarily unavailable.', 503);
  }
}
