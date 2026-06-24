/**
 * Flattens a nested object into dot-notation keys for MongoDB $set partial updates.
 * Arrays are passed through as-is — only plain objects are recursed into.
 *
 * @example
 * flattenObject({ name: { ar: 'تقنية' }, tags: ['a', 'b'] })
 * // → { 'name.ar': 'تقنية', tags: ['a', 'b'] }
 */
export function flattenObject(
  obj: Record<string, any>,
  prefix = '',
): Record<string, any> {
  return Object.keys(obj).reduce(
    (acc, key) => {
      const value = obj[key];
      const flatKey = prefix ? `${prefix}.${key}` : key;

      const isPlainObject =
        value !== null && typeof value === 'object' && !Array.isArray(value);

      if (isPlainObject) {
        Object.assign(acc, flattenObject(value, flatKey));
      } else {
        acc[flatKey] = value;
      }

      return acc;
    },
    {} as Record<string, any>,
  );
}
