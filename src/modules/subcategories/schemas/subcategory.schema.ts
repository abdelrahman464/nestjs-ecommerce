import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Category } from '../../categories/schemas/category.schema';

@Schema({ timestamps: true })
export class SubCategory {
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
    required: true,
  })
  category: Types.ObjectId;
}

export type SubCategoryDocument = HydratedDocument<SubCategory>;
export const SubCategorySchema = SchemaFactory.createForClass(SubCategory);

// A title is unique per parent category, not globally.
SubCategorySchema.index({ category: 1, 'title.en': 1 }, { unique: true });
