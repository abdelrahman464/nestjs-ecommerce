import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { localizedPath } from '../../../common/constants/supported-content-locales.constant';
import { Brand } from '../../brands/schemas/brand.schema';
import { Category } from '../../categories/schemas/category.schema';
import { ProductOptionType } from '../enums/product-option-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import {
  ProductOptionDefinition,
  ProductOptionDefinitionSchema,
} from './product-option-definition.schema';

@Schema({ timestamps: true })
export class Product {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Category.name,
    required: true,
  })
  category: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Brand.name })
  brand?: Types.ObjectId;

  /** Unique constraint is on DEFAULT_CONTENT_LOCALE via partial index below. */
  @Prop({ required: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true, i18n: true })
  description: string;

  @Prop({ trim: true, i18n: true })
  shortDescription?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  /** Denormalized from reviews — never accept from client DTOs. */
  @Prop({ default: 0, min: 0, max: 5 })
  ratingsAverage: number;

  @Prop({ default: 0, min: 0 })
  ratingsQuantity: number;

  @Prop({ default: false })
  showOnBanner: boolean;

  @Prop({ default: 0 })
  order: number;

  /**
   * Option axes for this product (admin UI + combination validation).
   * Max 3 types. Empty = simple product with one default variant.
   */
  @Prop({ type: [ProductOptionDefinitionSchema], default: [] })
  optionDefinitions: ProductOptionDefinition[];

  /** Admin table grouping axis (display only). Must be one of optionDefinitions.types. */
  @Prop({ type: String, enum: ProductOptionType, default: null })
  groupBy?: ProductOptionType | null;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

const notDeleted = { deletedAt: null };

/*
Unique only where deletedAt: null
Soft-delete “T-Shirt” → you can create a new product with the same title
*/
ProductSchema.index(
  { [localizedPath('title')]: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);

ProductSchema.index({ deletedAt: 1, order: 1, createdAt: -1 });
ProductSchema.index({ deletedAt: 1, category: 1, order: 1 });
ProductSchema.index({ deletedAt: 1, status: 1, order: 1 });
ProductSchema.index({ deletedAt: 1, showOnBanner: 1, order: 1 });
