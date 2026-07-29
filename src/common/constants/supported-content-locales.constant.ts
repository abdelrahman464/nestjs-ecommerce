/**
 * Locales stored for i18n content fields (e.g. product title).
 * Keep in sync with mongoose-i18n-localize `locales` on each schema plugin.
 *
 * Index 0 is the canonical / source-of-truth locale for:
 * - uniqueness checks
 * - slug generation
 * - compound unique indexes
 */
export const SUPPORTED_CONTENT_LOCALES = ['en', 'de'] as const;

export type ContentLocale = (typeof SUPPORTED_CONTENT_LOCALES)[number];

/** Canonical content locale — never hardcode 'en' / 'de' in business logic. */
export const DEFAULT_CONTENT_LOCALE: ContentLocale = SUPPORTED_CONTENT_LOCALES[0];

/** Dot-path for a localized schema field, e.g. localizedPath('title') → 'title.de' */
export function localizedPath(
  field: string,
  locale: ContentLocale = DEFAULT_CONTENT_LOCALE,
): string {
  return `${field}.${locale}`;
}

/** Search paths across all supported locales, e.g. localizedSearchPaths('title') */
export function localizedSearchPaths(field: string): string[] {
  return SUPPORTED_CONTENT_LOCALES.map((locale) => `${field}.${locale}`);
}

/**
 * Read a value from a localized object or pass through a plain string
 * (after mongoose-i18n localization middleware may already flatten it).
 */
export function getLocalizedValue(
  value:
    | Partial<Record<ContentLocale, string>>
    | string
    | null
    | undefined,
  locale: ContentLocale = DEFAULT_CONTENT_LOCALE,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return value[locale];
}
