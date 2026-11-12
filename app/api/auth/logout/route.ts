import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, NO_STORE, sameOrigin, tokenHash } from '@/lib/auth';
import { getServerDatabase } from '@/lib/supabase-server';
import { fail } from '@/lib/http';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Request origin is not allowed.', 403);
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token && token.length <= 150) {
      const { error } = await getServerDatabase().from('collection_sessions')
        .delete().eq('session_hash', tokenHash(token));
      if (error) return fail('Could not safely sign out. Try again.', 503);
    }
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0, httpOnly: true,
      secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    return response;
  } catch {
    return fail('Sign-out is temporarily unavailable.', 503);
  }
}
