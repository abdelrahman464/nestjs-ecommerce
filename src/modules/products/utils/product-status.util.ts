import { ProductStatus } from '../enums/product-status.enum';

/**
 * Single policy for stock ↔ status (avoids dual source of truth):
 * - INACTIVE is always respected (admin hide), regardless of stock
 * - stock <= 0 ⇒ OUT_OF_STOCK (unless INACTIVE)
 * - stock > 0 and was OUT_OF_STOCK ⇒ ACTIVE
 * - otherwise keep requested/default status
 *
 * Reject ACTIVE when stock is 0 at the service layer before calling this.
 */
export function resolveProductStatus(
  stock: number,
  requested?: ProductStatus,
): ProductStatus {
  if (requested === ProductStatus.INACTIVE) {
    return ProductStatus.INACTIVE;
  }

  if (stock <= 0) {
    return ProductStatus.OUT_OF_STOCK;
  }

  if (
    requested === ProductStatus.OUT_OF_STOCK ||
    requested === undefined ||
    requested === null
  ) {
    return ProductStatus.ACTIVE;
  }

  return requested;
}
