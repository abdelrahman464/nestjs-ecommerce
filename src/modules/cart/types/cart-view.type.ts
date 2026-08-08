import { Types } from 'mongoose';

export enum CartItemUnavailableReason {
  DELETED = 'deleted',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'outOfStock',
  INSUFFICIENT_STOCK = 'insufficientStock',
}

/**
 * Read-model for one cart line — computed on every read, never persisted
 * (except `unitPriceAtAdd` / `productNameAtAdd`, which live on the document).
 */
export interface CartItemView {
  variant: Types.ObjectId;
  product: Types.ObjectId | null;
  quantity: number;
  unitPriceAtAdd: number;
  productNameAtAdd: string;
  /** Live price resolved from the variant right now (falls back to the snapshot if the variant is gone). */
  currentUnitPrice: number;
  priceChanged: boolean;
  available: boolean;
  /** Set only when `available` is false. */
  unavailableReason?: CartItemUnavailableReason;
  /** Live stock available for this variant (helps the client suggest a reduced quantity). */
  availableQuantity: number;
  /** `available ? currentUnitPrice * quantity : 0` — excluded from cart subtotal otherwise. */
  lineSubtotal: number;
}

/** Read-model for the whole cart — what controllers return. */
export interface CartView {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: CartItemView[];
  /** Sum of quantities across ALL lines (including unavailable ones — stable badge count). */
  itemsCount: number;
  /** Sum of `lineSubtotal` — purchasable lines only. */
  subtotal: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}
