import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';
import { Product } from './product.schema';

@Schema({ timestamps: true, collection: 'product_variants' })
export class ProductVariant {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ required: true, trim: true })
  barcode: string;

  /**
   * Selected option values for this sellable unit.
   * Keys must match product.optionDefinitions types.
   * Empty object = default variant (no options).
   */
  @Prop({ type: Map, of: String, default: {} })
  options: Map<string, string>;

  /** Derived uniqueness key — never accept from client. */
  @Prop({ required: true, trim: true })
  optionsKey: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 0, min: 0 })
  priceAfterDiscount: number;

  /**
   * Cached total on-hand across all warehouses (SUM of inventory_levels).
   * Only InventoryService may mutate this (same TX as level + movement).
   */
  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ type: String, enum: ProductUnit, default: ProductUnit.PIECE })
  unit: ProductUnit;

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: 0 })
  order: number;

  /** Public Cloudinary HTTPS URLs — per-variant gallery for the storefront. */
  @Prop({ type: [String], default: [] })
  images: string[];

  /**
   * Parallel to `images[]`: Cloudinary public_id for each URL (same index).
   * Hidden from API responses; used to destroy assets on remove/delete.
   */
  @Prop({ type: [String], default: [], select: false })
  imagePublicIds: string[];

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ProductVariantDocument = HydratedDocument<ProductVariant>;

export const ProductVariantSchema =
  SchemaFactory.createForClass(ProductVariant);

const notDeleted = { deletedAt: null };

ProductVariantSchema.index(
  { product: 1, order: 1 },
  { partialFilterExpression: notDeleted },
);
ProductVariantSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductVariantSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductVariantSchema.index(
  { product: 1, optionsKey: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);
ProductVariantSchema.index(
  { product: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, isDefault: true },
  },
);
ProductVariantSchema.index(
  { product: 1, status: 1 },
  { partialFilterExpression: notDeleted },
);
