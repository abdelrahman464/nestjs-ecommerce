import { registerAs } from '@nestjs/config';

/**
 * HTTP rate limits (status 429).
 *
 * How Nest applies the numbers:
 *  - The `default` bucket in AppModule is the global bouncer for EVERY route.
 *  - `@Throttle(THROTTLE.AUTH)` REPLACES that cap on one handler. It does not
 *    add a second bucket. Browsing products never spends your login budget
 *    (Nest keys counters per IP + per route).
 *  - `@SkipThrottle()` = "this door has no bouncer" — Stripe/Klarna webhooks.
 *
 * Why Redis, not RAM: two API containers would otherwise keep two clipboards
 * and never talk. Redis is the shared clipboard (same client as sessions).
 *
 * Why auth/checkout numbers are code, not env: they are a security policy.
 * A mistyped `THROTTLE_AUTH_LIMIT=5000` in prod should not silently happen.
 * The global browsing cap IS env-tunable (Black Friday vs quiet Tuesday).
 *
 * TTL is milliseconds (`@nestjs/throttler` v6).
 */

function envPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Shopper browsing: ~2 requests/second averaged over a minute. */
export const THROTTLE_DEFAULT_TTL_MS = 60_000;
export const THROTTLE_DEFAULT_LIMIT = 120;

/**
 * 5 attempts / 15 min ≈ a human mistyping a password a few times,
 * not a script trying 10 000 passwords from a leaked list.
 */
export const THROTTLE_AUTH_TTL_MS = 15 * 60_000;
export const THROTTLE_AUTH_LIMIT = 5;

/**
 * SPA refresh on tab-focus / token expiry. Looser than login so a refresh
 * loop does not lock the user out; still tight against token-spray bots.
 */
export const THROTTLE_REFRESH_TTL_MS = 15 * 60_000;
export const THROTTLE_REFRESH_LIMIT = 30;

/** Create / resume a Stripe session. */
export const THROTTLE_CHECKOUT_TTL_MS = 60_000;
export const THROTTLE_CHECKOUT_LIMIT = 10;

/**
 * Payloads for `@Throttle(...)`.
 * The object key MUST be `default` — that is the named bucket registered in
 * AppModule. `{ auth: { limit: 5 } }` would look for a throttler named "auth"
 * that we never registered, and the route would keep the global 120/min cap.
 */
export const THROTTLE = {
  AUTH: {
    default: { ttl: THROTTLE_AUTH_TTL_MS, limit: THROTTLE_AUTH_LIMIT },
  },
  REFRESH: {
    default: { ttl: THROTTLE_REFRESH_TTL_MS, limit: THROTTLE_REFRESH_LIMIT },
  },
  CHECKOUT: {
    default: {
      ttl: THROTTLE_CHECKOUT_TTL_MS,
      limit: THROTTLE_CHECKOUT_LIMIT,
    },
  },
} as const;

export default registerAs('throttler', () => ({
  default: {
    ttl: envPositiveInt('THROTTLE_TTL_MS', THROTTLE_DEFAULT_TTL_MS),
    limit: envPositiveInt('THROTTLE_LIMIT', THROTTLE_DEFAULT_LIMIT),
  },
}));
