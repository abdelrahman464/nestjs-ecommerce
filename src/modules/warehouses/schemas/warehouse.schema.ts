import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Optional postal address for a warehouse (display / shipping later). */
@Schema({ _id: false })
export class WarehouseAddress {
  @Prop({ trim: true })
  street?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  postalCode?: string;

  @Prop({ trim: true })
  country?: string;
}

export const WarehouseAddressSchema =
  SchemaFactory.createForClass(WarehouseAddress);

/**
 * Physical or logical stock location (Berlin, Hamburg, …).
 * Stock quantities live on inventory_levels, not on this document.
 */
@Schema({ timestamps: true, collection: 'warehouses' })
export class Warehouse {
  @Prop({ required: true, trim: true })
  name: string;

  /** Short unique code, e.g. BER — stored uppercase. */
  @Prop({ required: true, trim: true, uppercase: true })
  code: string;

  @Prop({ type: WarehouseAddressSchema })
  address?: WarehouseAddress;

  /**
   * Exactly one live default (partial unique index).
   * Used for variant opening stock + MVP sales until Phase 11 allocation.
   */
  @Prop({ default: false })
  isDefault: boolean;

  /** Inactive warehouses reject new movements / sales. */
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type WarehouseDocument = HydratedDocument<Warehouse>;
export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);

const notDeleted = { deletedAt: null };

WarehouseSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: notDeleted },
);

/** One default among non-deleted warehouses. */
WarehouseSchema.index(
  { isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, isDefault: true },
  },
);

WarehouseSchema.index(
  { isActive: 1, order: 1 },
  { partialFilterExpression: notDeleted },
);
