import { Expose, Transform } from 'class-transformer';
import { InventoryDirection } from '../enums/inventory-direction.enum';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum';
import { InventoryReferenceType } from '../enums/inventory-reference-type.enum';

export class InventoryMovementResponseDto {
  @Expose()
  @Transform(({ obj }) => obj._id?.toString?.() ?? obj._id)
  _id: string;

  @Expose()
  @Transform(({ obj }) => obj.variant?.toString?.() ?? obj.variant)
  variant: string;

  @Expose()
  @Transform(({ obj }) => obj.product?.toString?.() ?? obj.product)
  product: string;

  @Expose()
  type: InventoryMovementType;

  @Expose()
  quantity: number;

  @Expose()
  direction: InventoryDirection;

  @Expose()
  delta: number;

  @Expose()
  balanceBefore: number;

  @Expose()
  balanceAfter: number;

  @Expose()
  reason?: string;

  @Expose()
  referenceType: InventoryReferenceType;

  @Expose()
  @Transform(({ obj }) =>
    obj.referenceId == null
      ? null
      : (obj.referenceId?.toString?.() ?? obj.referenceId),
  )
  referenceId?: string | null;

  @Expose()
  @Transform(({ obj }) =>
    obj.createdBy == null
      ? null
      : (obj.createdBy?.toString?.() ?? obj.createdBy),
  )
  createdBy?: string | null;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
