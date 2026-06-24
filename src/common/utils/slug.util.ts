import slugify from 'slugify';
import { Model } from 'mongoose';

export async function generateUniqueSlug(
  title: string,
  model: Model<any>,
  excludeId?: string,
): Promise<string> {
  const baseSlug = slugify(title, { lower: true, strict: true, trim: true });

  const query: Record<string, any> = {
    slug: new RegExp(`^${baseSlug}(-\\d+)?$`),
  };
  if (excludeId) {
    query['_id'] = { $ne: excludeId }; // exclude current doc on update
  }

  const existing = await model.find(query).select('slug').lean();

  if (!existing.length) return baseSlug;

  // Extract numeric suffixes and get the next available number
  const suffixes = existing.map(({ slug }) => {
    const match = slug.match(/-(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  });

  const nextSuffix = Math.max(...suffixes) + 1;
  return `${baseSlug}-${nextSuffix}`;
}
