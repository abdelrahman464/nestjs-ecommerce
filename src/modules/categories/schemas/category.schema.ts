import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { localizedPath } from '../../../common/constants/supported-content-locales.constant';

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true, i18n: true })
  description?: string;

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
