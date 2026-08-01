import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { ProductVariant } from '../../products/schemas/product-variant.schema';
import { User } from '../../users/schemas/user.schema';
import { InventoryDirection } from '../enums/inventory-direction.enum';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum';
import { InventoryReferenceType } from '../enums/inventory-reference-type.enum';

/**
 * Append-only inventory ledger entry.
 *
 * Design (Approach B):
 * - This collection is the audit trail (source of truth for *why* stock changed).
 * - `product_variants.stock` is a cached balance updated in the **same transaction**
 *   as inserting a movement — only via InventoryService.
 * - Never UPDATE/DELETE movements; correct mistakes with a compensating movement.
 */
@Schema({ timestamps: true, collection: 'inventory_movements' })
export class InventoryMovement {

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  /**
   * Lets product-level reports avoid joining every variant first.
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product: Types.ObjectId;


  @Prop({
    type: String,
    enum: InventoryMovementType,
    required: true,
  })
  type: InventoryMovementType;

  /**
   * Absolute units moved — always > 0.
   * Sign lives on `direction` / `delta`, never on this field.
   */
  @Prop({ required: true, min: 1 })
  quantity: number;

  /** Whether stock increased (`in`) or decreased (`out`). */
  @Prop({
    type: String,
    enum: InventoryDirection,
    required: true,
  })
  direction: InventoryDirection;

  /**
   * Signed effect on balance: +quantity for `in`, -quantity for `out`.
   * Stored so reports can SUM(delta) without re-deriving direction.
   */
  @Prop({ required: true })
  delta: number;

  /** Cached stock on the variant immediately before this movement. */
  @Prop({ required: true, min: 0 })
  balanceBefore: number;

  /**
   * Cached stock on the variant immediately after this movement.
   * Must equal balanceBefore + delta and never go below 0.
   */
  @Prop({ required: true, min: 0 })
  balanceAfter: number;

  /** Optional human note */
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
   * - manual → optional external id
   * - webhook → payment id
   * - variant_create → variant id
   * - manual_order → order id (future) -admin created order for a customer-
   *
   * Used with the unique partial index for idempotent webhook retries.
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  })
  referenceId?: Types.ObjectId | null;

  /**
   * Admin/manager who performed the change when a human acted.
   * Omitted for automated webhook fulfillment (referenceType explains the actor).
   */
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

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

InventoryMovementSchema.index({ variant: 1, createdAt: -1 });

InventoryMovementSchema.index({ product: 1, createdAt: -1 });

/**
 * Idempotency for sales (and any referenced movement).
 * Partial: only documents with a real referenceId participate —
 * plain manual restocks without a reference can repeat freely.
 *
 * Webhook retry with the same payment+variant+sale ⇒ duplicate key /
 * find-existing → treat as success (no double decrement).
 */
InventoryMovementSchema.index(
  { referenceType: 1, referenceId: 1, variant: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: { $type: 'objectId' },
    },
  },
);
