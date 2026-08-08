import { ProductVariant } from '../schemas/product-variant.schema';

/**
 * Effective selling price for a variant: the discount price when one is set,
 * otherwise the regular price. Single source of truth — used by cart,
 * checkout, and manual order item building so they never drift apart.
 */
export function resolveVariantUnitPrice(
  variant: Pick<ProductVariant, 'price' | 'priceAfterDiscount'>,
): number {
  return variant.priceAfterDiscount && variant.priceAfterDiscount > 0
    ? variant.priceAfterDiscount
    : variant.price;
}
