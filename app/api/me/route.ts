import type { NextRequest } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const member = await getSessionMember(req);
    return member ? ok({ member }) : fail('Not signed in.', 401);
  } catch {
    return fail('Service is not configured or temporarily unavailable.', 503);
  }
}
