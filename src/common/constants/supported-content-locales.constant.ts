import { I18nContext } from 'nestjs-i18n';

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

/**
 * Resolve the *current request's* language down to one of our supported
 * content locales, falling back to the canonical default when the
 * request's language isn't one of them (e.g. `Accept-Language: fr`).
 *
 * `I18nContext.current()` (no args) reads from an `AsyncLocalStorage`
 * populated by `I18nMiddleware` for every request, so this works from
 * anywhere in the request lifecycle — controllers, services, repositories —
 * not just from places that receive an `ExecutionContext`/`ArgumentsHost`.
 */
export function resolveRequestContentLocale(): ContentLocale {
  const lang = I18nContext.current()?.lang;
  return (SUPPORTED_CONTENT_LOCALES as readonly string[]).includes(lang ?? '')
    ? (lang as ContentLocale)
    : DEFAULT_CONTENT_LOCALE;
}
