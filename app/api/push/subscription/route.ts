import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionMember, sameOrigin } from '@/lib/auth';
import { readJsonObject, fail } from '@/lib/http';
import { getServerDatabase } from '@/lib/supabase-server';
import { endpointDigest, validatedSubscription } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Request origin is not allowed.', 403);
  const member = await getSessionMember(request);
  if (!member) return fail('Sign in to enable invitations.', 401);
  const body = await readJsonObject(request);
  const subscription = validatedSubscription(body?.subscription);
  if (!subscription) return fail('Invalid push subscription.', 400);
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return fail('Push notifications are not configured.', 503);
  }
  try {
    const db = getServerDatabase();
    const { error } = await db.from('collection_push_subscriptions').upsert({
      member_id: member.id,
      endpoint: subscription.endpoint,
      endpoint_hash: endpointDigest(subscription.endpoint),
      p256dh: subscription.keys.p256dh,
      auth_secret: subscription.keys.auth,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'endpoint_hash' });
    if (error) return fail('Could not save notification permissions.', 503);
    const { error: budgetError } = await db.from('collection_push_invite_budget').upsert({
      member_id: member.id,
      next_allowed_at: '1970-01-01T00:00:00.000Z'
    }, { onConflict: 'member_id', ignoreDuplicates: true });
    if (budgetError) return fail('Notification setup incomplete. Please retry.', 503);
    return NextResponse.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return fail('Notification registration temporarily unavailable.', 503); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Request origin is not allowed.', 403);
  const member = await getSessionMember(request);
  if (!member) return fail('Sign in to disable notifications.', 401);
  const body = await readJsonObject(request);
  const subscription = validatedSubscription(body?.subscription);
  if (!subscription) return fail('Invalid push subscription.', 400);
  try {
    const { error } = await getServerDatabase().from('collection_push_subscriptions')
      .delete().eq('member_id', member.id).eq('endpoint_hash', endpointDigest(subscription.endpoint));
    if (error) return fail('Could not remove notification subscription.', 503);
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return fail('Could not disable notifications right now.', 503); }
}
