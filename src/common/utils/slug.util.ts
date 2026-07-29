import slugify from 'slugify';
import { FilterQuery, Model } from 'mongoose';

export type GenerateUniqueSlugOptions = {
  title: string;
  model: Model<any>;
  /** On update: ignore the current document so renaming does not force a suffix. */
  excludeId?: string;
  /** Extra Mongo filters (e.g. soft-delete: `{ deletedAt: null }`). */
  extraFilter?: FilterQuery<any>;
};

export async function generateUniqueSlug(
  options: GenerateUniqueSlugOptions,
): Promise<string> {
  const { title, model, excludeId, extraFilter = {} } = options;

  const baseSlug = slugify(title, { lower: true, strict: true, trim: true });

  const query: Record<string, any> = {
    ...extraFilter,
    slug: new RegExp(`^${baseSlug}(-\\d+)?$`),
  };
  if (excludeId) {
    query['_id'] = { $ne: excludeId };
  }

  const existing = await model.find(query).select('slug').lean();

  if (!existing.length) return baseSlug;

  const suffixes = existing.map(({ slug }) => {
    const match = slug.match(/-(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  });

  const nextSuffix = Math.max(...suffixes) + 1;
  return `${baseSlug}-${nextSuffix}`;
}
