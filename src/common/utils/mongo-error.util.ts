/*
T1: findBySku("ABC") → null
T2: findBySku("ABC") → null
T1: insert OK
T2: insert → Mongo E11000
--So: we are not “waiting for DB errors on purpose.”
We are saying: if a race slips past Layer A, Layer B must catch it, and Layer C must not return a 500.
*/

type MongooseFieldError = { message?: string };

export type MappedMongoError = {
  statusCode: number;
  /** i18n key, e.g. common.duplicateKey */
  message: string;
  args?: Record<string, unknown>;
};

/** MongoDB duplicate key error (unique index violation). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}

/** Field names from keyPattern / keyValue / error message. */
export function getDuplicateKeyFields(error: unknown): string[] {
  if (!isDuplicateKeyError(error)) return [];

  const err = error as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };

  if (err.keyPattern && typeof err.keyPattern === 'object') {
    return Object.keys(err.keyPattern);
  }
  if (err.keyValue && typeof err.keyValue === 'object') {
    return Object.keys(err.keyValue);
  }

  const message = typeof err.message === 'string' ? err.message : '';
  const indexMatch = message.match(/index:\s+([^\s]+)/i);
  if (indexMatch?.[1]) {
    // e.g. "sku_1" → "sku", "title.en_1" → "title.en"
    return [
      indexMatch[1].replace(/_?\d+$/, '').replace(/_$/, '') || indexMatch[1],
    ];
  }

  const dupMatch = message.match(/dup key:\s*\{([^}]+)\}/i);
  if (dupMatch?.[1]) {
    return dupMatch[1]
      .split(',')
      .map((part) => part.split(':')[0]?.trim().replace(/["']/g, ''))
      .filter((f): f is string => Boolean(f));
  }

  return [];
}

/** Which field collided (first), when Mongo includes it. */
export function getDuplicateKeyField(error: unknown): string | undefined {
  return getDuplicateKeyFields(error)[0];
}

/** Duplicate key value for the first field (may be null). */
export function getDuplicateKeyValue(error: unknown): unknown {
  if (!isDuplicateKeyError(error)) return undefined;
  const err = error as { keyValue?: Record<string, unknown> };
  const fields = getDuplicateKeyFields(error);
  if (!fields.length || !err.keyValue) return undefined;
  return err.keyValue[fields[0]];
}

/**
 * Map Mongo / Mongoose driver errors → client-safe HTTP payload.
 * Returns null when the error is not a known DB client error.
 */
export function mapMongoError(error: unknown): MappedMongoError | null {
  if (isDuplicateKeyError(error)) {
    const field = getDuplicateKeyFields(error)[0] ?? 'value';
    const value = getDuplicateKeyValue(error);
    const displayValue =
      value === null || value === undefined || value === ''
        ? undefined
        : String(value);

    return {
      statusCode: 409,
      message: 'common.duplicateKey',
      args: {
        field,
        ...(displayValue !== undefined && { value: displayValue }),
      },
    };
  }

  if (typeof error !== 'object' || error === null) return null;

  const name = 'name' in error ? String((error as { name: unknown }).name) : '';
  const message =
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';

  // Invalid ObjectId / bad cast on a path
  if (name === 'CastError') {
    const path =
      'path' in error && typeof (error as { path: unknown }).path === 'string'
        ? (error as { path: string }).path
        : 'id';
    return {
      statusCode: 400,
      message: 'common.invalidId',
      args: { field: path },
    };
  }

  // Schema validation from Mongoose
  if (name === 'ValidationError') {
    const maybeErrors = (error as { errors?: Record<string, MongooseFieldError> })
      .errors;
    const details = maybeErrors
      ? Object.values(maybeErrors)
          .map((e) => e?.message)
          .filter((m): m is string => Boolean(m))
          .join('; ')
      : '';

    return {
      statusCode: 400,
      message: 'common.validationFailed',
      args: {
        details: details || message || 'Validation failed',
      },
    };
  }

  return null;
}
