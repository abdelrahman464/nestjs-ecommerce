import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Nested SEO overrides embedded on content entities:
 *   product.seo / category.seo / brand.seo / article.seo
 *
 * When unset, `buildSeoMeta` falls back to title / description / image.
 */
@Schema({ _id: false })
export class SeoFields {
  @Prop({ trim: true, i18n: true })
  metaTitle?: string;

  @Prop({ trim: true, i18n: true })
  metaDescription?: string;

  @Prop({ trim: true, i18n: true })
  keywords?: string;
}

export const SeoFieldsSchema = SchemaFactory.createForClass(SeoFields);
