import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { ProductVariant } from '../../products/schemas/product-variant.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';

/**
 * On-hand quantity for one variant in one warehouse.
 *
 * variant.stock (cache) = SUM of all levels for that variant.
 * Only InventoryService may change `quantity` (same TX as a movement).
 */
@Schema({ timestamps: true, collection: 'inventory_levels' })
export class InventoryLevel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  /** Denormalized for product-level reports. */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Warehouse.name,
    required: true,
  })
  warehouse: Types.ObjectId;

  @Prop({ required: true, min: 0, default: 0 })
  quantity: number;
}

export type InventoryLevelDocument = HydratedDocument<InventoryLevel>;
export const InventoryLevelSchema =
  SchemaFactory.createForClass(InventoryLevel);

/** One balance document per variant × warehouse. */
InventoryLevelSchema.index({ variant: 1, warehouse: 1 }, { unique: true });

/** “What’s in this warehouse?” — newest updates first. */
InventoryLevelSchema.index({ warehouse: 1, updatedAt: -1 });
