import {
  ContentLocale,
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../constants/supported-content-locales.constant';

export type SeoEntityInput = {
  slug: string;
  /** URL path prefix without trailing slash, e.g. `/products` */
  pathPrefix: string;
  title?: Parameters<typeof getLocalizedValue>[0];
  description?: Parameters<typeof getLocalizedValue>[0];
  metaTitle?: Parameters<typeof getLocalizedValue>[0];
  metaDescription?: Parameters<typeof getLocalizedValue>[0];
  keywords?: Parameters<typeof getLocalizedValue>[0];
  /** Prefer first gallery/cover image when set. */
  image?: string | null;
};

export type SeoMeta = {
  title: string;
  description: string;
  keywords: string;
  image: string | null;
  slug: string;
  path: string;
  canonicalUrl: string;
};

/**
 * Build a FE-ready SEO payload for `<title>` / meta / Open Graph.
 * Prefer explicit meta* fields; fall back to content fields + defaults.
 */
export function buildSeoMeta(
  input: SeoEntityInput,
  locale: ContentLocale = DEFAULT_CONTENT_LOCALE,
  frontendUrl: string,
): SeoMeta {
  const title =
    getLocalizedValue(input.metaTitle, locale) ||
    getLocalizedValue(input.title, locale) ||
    input.slug;

  const rawDescription =
    getLocalizedValue(input.metaDescription, locale) ||
    getLocalizedValue(input.description, locale) ||
    '';

  // Meta descriptions work best under ~160 chars; trim without cutting mid-word when long.
  const description = truncateMeta(rawDescription, 160);

  const keywords = getLocalizedValue(input.keywords, locale) || '';

  const path = `${input.pathPrefix}/${input.slug}`;
  const base = frontendUrl.replace(/\/$/, '');

  return {
    title,
    description,
    keywords,
    image: input.image ?? null,
    slug: input.slug,
    path,
    canonicalUrl: `${base}${path}`,
  };
}

function truncateMeta(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}
