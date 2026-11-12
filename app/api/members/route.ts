import type { NextRequest } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { getServerDatabase } from '@/lib/supabase-server';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const current = await getSessionMember(req);
    if (!current) return fail('Not signed in.', 401);
    const { data, error } = await getServerDatabase().from('collection_members')
      .select('id,username,created_at').order('created_at', { ascending: true }).limit(1000);
    if (error) return fail('Could not load the collection.', 503);
    return ok({ members: data });
  } catch {
    return fail('Service is not configured or temporarily unavailable.', 503);
  }
}
