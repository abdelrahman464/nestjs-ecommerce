import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { ProductVariant } from '../../products/schemas/product-variant.schema';
import { User } from '../../users/schemas/user.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';
import { InventoryDirection } from '../enums/inventory-direction.enum';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum';
import { InventoryReferenceType } from '../enums/inventory-reference-type.enum';

/**
 * Append-only inventory ledger entry (per warehouse).
 *
 * - Audit trail for *why* stock changed at a location.
 * - `inventory_levels.quantity` + `product_variants.stock` updated in the same TX.
 * - Never UPDATE/DELETE; correct with a compensating movement.
 */
@Schema({ timestamps: true, collection: 'inventory_movements' })
export class InventoryMovement {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  /** Denormalized product id for product-level reports. */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product: Types.ObjectId;

  /**
   * Location where this movement applied.
   * Required for multi-warehouse; transfers use two rows (one per warehouse).
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Warehouse.name,
    required: true,
  })
  warehouse: Types.ObjectId;

  @Prop({
    type: String,
    enum: InventoryMovementType,
    required: true,
  })
  type: InventoryMovementType;

  /**
   * Absolute units moved — always > 0.
   * Sign lives on `direction` / `delta`.
   */
  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({
    type: String,
    enum: InventoryDirection,
    required: true,
  })
  direction: InventoryDirection;

  /** Signed effect: +quantity for `in`, -quantity for `out`. */
  @Prop({ required: true })
  delta: number;

  /**
   * Warehouse level quantity before this movement (not the global variant total).
   * variant.stock is maintained separately via $inc by the same delta.
   */
  @Prop({ required: true, min: 0 })
  balanceBefore: number;

  /** Warehouse level quantity after this movement. */
  @Prop({ required: true, min: 0 })
  balanceAfter: number;

  @Prop({ trim: true })
  reason?: string;

  @Prop({
    type: String,
    enum: InventoryReferenceType,
    required: true,
  })
  referenceType: InventoryReferenceType;

  /**
   * Linked document when applicable:
   * - webhook → payment id
   * - variant_create → variant id
   * - transfer → shared id for the out/in pair
   * - manual_order → order id (future)
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  })
  referenceId?: Types.ObjectId | null;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    default: null,
  })
  createdBy?: Types.ObjectId | null;
}

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;

export const InventoryMovementSchema =
  SchemaFactory.createForClass(InventoryMovement);

InventoryMovementSchema.index({ variant: 1, createdAt: -1 });
InventoryMovementSchema.index({ product: 1, createdAt: -1 });
InventoryMovementSchema.index({ warehouse: 1, createdAt: -1 });

/**
 * Idempotency + transfer pairs.
 * Includes `warehouse` so transfer out@A and in@B can share referenceId.
 *
 * Ops: drop the old unique index without warehouse if it still exists:
 *   referenceType_1_referenceId_1_variant_1_type_1
 */
InventoryMovementSchema.index(
  { referenceType: 1, referenceId: 1, variant: 1, type: 1, warehouse: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: { $type: 'objectId' },
    },
  },
);
