/**
 * Reservation TTLs by source (ms).
 * checkout: short hold while redirecting to Stripe/Klarna
 * manual_order: bank transfer / proof may take longer
 */
export const RESERVATION_TTL_MS = {
  checkout: 15 * 60 * 1000, // 15 minutes
  manual_order: 48 * 60 * 60 * 1000, // 48 hours
} as const;
