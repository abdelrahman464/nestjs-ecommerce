import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { localizedPath } from '../../../common/constants/supported-content-locales.constant';
import { Brand } from '../../brands/schemas/brand.schema';
import { Category } from '../../categories/schemas/category.schema';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

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

  @Prop({ required: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 0, min: 0 })
  priceAfterDiscount: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ type: String, enum: ProductUnit, default: ProductUnit.PIECE })
  unit: ProductUnit;

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

  /** Soft delete — null means active row; unique indexes ignore deleted docs. */
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

const notDeleted = { deletedAt: null };

// Canonical title uniqueness (source locale only), soft-delete aware
ProductSchema.index(
  { [localizedPath('title')]: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);

ProductSchema.index({ deletedAt: 1, order: 1, createdAt: -1 });
ProductSchema.index({ deletedAt: 1, category: 1, order: 1 });
ProductSchema.index({ deletedAt: 1, status: 1, order: 1 });
ProductSchema.index({ deletedAt: 1, showOnBanner: 1, order: 1 });
