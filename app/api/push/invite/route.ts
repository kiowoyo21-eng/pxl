import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionMember, sameOrigin } from '@/lib/auth';
import { readJsonObject, fail } from '@/lib/http';
import { getServerDatabase } from '@/lib/supabase-server';
import { configureWebPush, INVITE_COOLDOWN_MINUTES, randomInvite, webpush } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Request origin is not allowed.', 403);
  const sender = await getSessionMember(request);
  if (!sender) return fail('Sign in to invite a character.', 401);
  const body = await readJsonObject(request);
  const targetId = body?.targetId;
  if (typeof targetId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(targetId)) {
    return fail('Invalid character.', 400);
  }
  if (targetId === sender.id) return fail('You cannot invite yourself.', 400);
  try {
    configureWebPush();
    const db = getServerDatabase();
    const { data: target, error: targetError } = await db.from('collection_members')
      .select('id').eq('id', targetId).maybeSingle();
    if (targetError) return fail('Character lookup failed.', 503);
    if (!target) return fail('Character not found.', 404);
    const { data: subs, error: subError } = await db.from('collection_push_subscriptions')
      .select('endpoint,endpoint_hash,p256dh,auth_secret').eq('member_id', target.id).limit(8);
    if (subError) return fail('Could not check notification settings.', 503);
    if (!subs?.length) return NextResponse.json({ status: 'not_subscribed' }, { headers: { 'Cache-Control': 'no-store' } });

    // Atomic recipient-wide rate limit. Stores no sender ID or message contents.
    const now = new Date();
    const next = new Date(now.getTime() + INVITE_COOLDOWN_MINUTES * 60_000);
    const { data: slot, error: limitError } = await db.from('collection_push_invite_budget')
      .update({ next_allowed_at: next.toISOString() })
      .eq('member_id', target.id).lte('next_allowed_at', now.toISOString())
      .select('member_id').maybeSingle();
    if (limitError) return fail('Invitation limiter unavailable.', 503);
    if (!slot) return NextResponse.json({ status: 'cooldown' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });

    const bodyText = randomInvite(sender.username);
    const payload = JSON.stringify({ title: 'PXL', body: bodyText, url: '/' });
    const results = await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification({endpoint:s.endpoint, keys:{p256dh:s.p256dh, auth:s.auth_secret}}, payload, {
          TTL: 600, urgency: 'normal'
        });
        return true;
      } catch (error) {
        const code = (error as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from('collection_push_subscriptions').delete().eq('endpoint_hash', s.endpoint_hash);
        }
        return false;
      }
    }));
    const succeeded = results.some((r) => r.status === 'fulfilled' && r.value === true);
    if (!succeeded) return fail('Could not deliver an invite. The device may have disabled notifications.', 503);
    return NextResponse.json({ status: 'sent' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return fail('Invitations are temporarily unavailable.', 503); }
}
