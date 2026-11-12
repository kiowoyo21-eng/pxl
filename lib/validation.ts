export const USERNAME_PATTERN = /^[A-Z]{1,3}$/;
export const PIN_PATTERN = /^\d{6}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  return USERNAME_PATTERN.test(normalized) ? normalized : null;
}

export function validPin(raw: unknown): raw is string {
  return typeof raw === 'string' && PIN_PATTERN.test(raw);
}
