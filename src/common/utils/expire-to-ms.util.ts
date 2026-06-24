/**
 * Parse the expire time to milliseconds
 * @param expire - The expire time
 * @param fallbackMs - The fallback milliseconds
 * @returns The milliseconds
 */

//converts your JWT expiry string (from .env) into milliseconds for browser cookies.

export function parseExpireToMs(expire: string | undefined, fallbackMs: number): number {
  if (!expire) return fallbackMs;

  const match = expire.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * (multipliers[unit] ?? 0) || fallbackMs;
}
