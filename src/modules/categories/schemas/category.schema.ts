import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { localizedPath } from '../../../common/constants/supported-content-locales.constant';
import {
  SeoFields,
  SeoFieldsSchema,
} from '../../../common/schemas/seo-fields.schema';

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true, i18n: true })
  description?: string;

  @Prop({ type: SeoFieldsSchema, default: undefined })
  seo?: SeoFields;

  /**
   * Public HTTPS URL from Cloudinary (what the frontend displays).
   * Example: https://res.cloudinary.com/<cloud>/image/upload/v123/.../nest-ecommerce/assets/<hash>
   */
  @Prop({ trim: true })
  image?: string;

  /**
   * Cloudinary public_id — NOT shown to clients usually, but we store it so we can
   * delete/replace the asset later (destroy by public_id).
   */
  @Prop({ trim: true, select: false })
  imagePublicId?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Category.name,
    default: null,
  })
  parentCategory?: Types.ObjectId | null;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index(
  { parentCategory: 1, [localizedPath('title')]: 1 },
  { unique: true },
);
CategorySchema.index({ parentCategory: 1 });
