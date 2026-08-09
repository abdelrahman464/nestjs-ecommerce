import {
  ContentLocale,
  getLocalizedValue,
  resolveRequestContentLocale,
} from '../../../common/constants/supported-content-locales.constant';

type LocalizedTitleValue = Partial<Record<ContentLocale, string>> | string | null | undefined;

/**
 * Resolve `title` on a populated `product` (or any i18n-titled) sub-document
 * to a plain string in the *current request's* language.
 *
 * The global `LocalizationInterceptor` only auto-resolves i18n fields on the
 * top-level response document/array — it never drills into populated
 * sub-documents — so any populate that surfaces a product's `title` for
 * display must resolve it manually here, otherwise the FE would get either
 * the raw `{ en, de }` locale map or a locale that ignores the request.
 */
export function resolveLocalizedTitle(
  doc: { title?: LocalizedTitleValue } | null | undefined,
): string | null {
  if (!doc) return null;
  return getLocalizedValue(doc.title, resolveRequestContentLocale()) ?? null;
}
