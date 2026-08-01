/**
 * Why stock changed. Absolute `quantity` is always > 0;
 * `direction` / `delta` carry the sign of the effect on balance.
 */
export enum InventoryMovementType {
  /** Opening balance when a variant is created with stock. */
  INITIAL = 'initial',
  /** Goods received (PO, supplier delivery). */
  RESTOCK = 'restock',
  /** Units sold (checkout fulfillment). */
  SALE = 'sale',
  /** Customer/return-to-stock. */
  RETURN = 'return',
  /** Manual correction (count mismatch); direction chosen by admin. */
  ADJUSTMENT = 'adjustment',
  /** Write-off (broken / unsellable). */
  DAMAGE = 'damage',
}

/** Types allowed on POST /inventory/movements (admin UI). */
export const MANUAL_MOVEMENT_TYPES = [
  InventoryMovementType.RESTOCK,
  InventoryMovementType.RETURN,
  InventoryMovementType.ADJUSTMENT,
  InventoryMovementType.DAMAGE,
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];
