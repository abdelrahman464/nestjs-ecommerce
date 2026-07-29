/**
 * Canonical fingerprint for a variant's option combination.
 * Used for unique index { product, optionsKey }.
 *
 * Empty options → "__default__"
 * Example: { size: "48", color: "Red" } → "color:red|size:48"
 */
export function buildOptionsKey(
  options: Record<string, string> | Map<string, string> | null | undefined,
): string {
  const raw: Record<string, string> = {};

  if (options instanceof Map) {
    for (const [key, value] of options.entries()) {
      raw[key] = value;
    }
  } else if (options && typeof options === 'object') {
    Object.assign(raw, options);
  }

  const entries = Object.entries(raw)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(
      ([key, value]) =>
        [key.trim().toLowerCase(), String(value).trim().toLowerCase()] as const,
    )
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) return '__default__';
  return entries.map(([key, value]) => `${key}:${value}`).join('|');
}
