import type { NextRequest } from 'next/server';
import { getServerDatabase } from '@/lib/supabase-server';
import { normalizeUsername } from '@/lib/validation';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const username = normalizeUsername(req.nextUrl.searchParams.get('username'));
  if (!username) return fail('Username must contain 1–3 letters.', 400);
  try {
    const { data, error } = await getServerDatabase().from('collection_members')
      .select('id').eq('username', username).maybeSingle();
    if (error) return fail('Could not check that name right now.', 503);
    return ok({ exists: Boolean(data), username });
  } catch {
    return fail('Service is not configured or temporarily unavailable.', 503);
  }
}
