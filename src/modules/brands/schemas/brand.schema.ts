import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  SeoFields,
  SeoFieldsSchema,
} from '../../../common/schemas/seo-fields.schema';

@Schema({ timestamps: true })
export class Brand {
  @Prop({ required: true, unique: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true, i18n: true })
  description?: string;

  @Prop({ type: SeoFieldsSchema, default: undefined })
  seo?: SeoFields;

  @Prop({ trim: true })
  logo?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export type BrandDocument = HydratedDocument<Brand>;
export const BrandSchema = SchemaFactory.createForClass(Brand);
