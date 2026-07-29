/*
T1: findBySku("ABC") → null
T2: findBySku("ABC") → null
T1: insert OK
T2: insert → Mongo E11000
--So: we are not “waiting for DB errors on purpose.”
We are saying: if a race slips past Layer A, Layer B must catch it, and Layer C must not return a 500.
*/

/** MongoDB duplicate key error (unique index violation). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}

/** Which field collided, when Mongo includes it in the error message. */
export function getDuplicateKeyField(error: unknown): string | undefined {
  if (!isDuplicateKeyError(error)) return undefined;
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';

  const match = message.match(/index:\s+([^\s]+)/i);
  return match?.[1];
}
