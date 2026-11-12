import { NextResponse } from 'next/server';
import { NO_STORE } from '@/lib/auth';

export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const size = Number(req.headers.get('content-length') || '0');
  if (size > 2048) return null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return null;
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
