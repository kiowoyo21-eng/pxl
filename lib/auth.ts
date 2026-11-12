import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { getServerDatabase } from '@/lib/supabase-server';
import type { Member } from '@/lib/types';

export const COOKIE_NAME = 'collection_session';
export const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

function getPepper(): string {
  const secret = process.env.PIN_PEPPER;
  if (!secret || secret.length < 32) throw new Error('PIN_PEPPER must be at least 32 characters.');
  return secret;
}

export function pinDigest(pin: string): string {
  return createHmac('sha256', getPepper()).update(pin).digest('hex');
}

export async function makePinHash(pin: string): Promise<string> {
  return bcrypt.hash(pinDigest(pin), 12);
}

export async function checkPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pinDigest(pin), hash);
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(memberId: string): Promise<string> {
  const db = getServerDatabase();
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_AGE_SECONDS * 1000).toISOString();
  const { error } = await db.from('collection_sessions').insert({
    session_hash: tokenHash(token), member_id: memberId, expires_at: expires
  });
  if (error) throw new Error('Could not create your session.');
  return token;
}

export async function getSessionMember(req: NextRequest): Promise<Member | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || token.length > 150) return null;
  const db = getServerDatabase();
  const { data: session, error } = await db.from('collection_sessions')
    .select('member_id,expires_at').eq('session_hash', tokenHash(token)).maybeSingle();
  if (error || !session || new Date(session.expires_at).getTime() <= Date.now()) return null;
  const { data: member, error: memberError } = await db.from('collection_members')
    .select('id,username,created_at').eq('id', session.member_id).maybeSingle();
  return memberError ? null : (member as Member | null);
}

export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Non-browser clients; browser cross-site JSON writes require CORS.
  return origin === req.nextUrl.origin;
}

export const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
