import { Types } from 'mongoose';
import { ProductOptionDefinition } from '../../products/schemas/product-option-definition.schema';

export enum CartItemUnavailableReason {
  DELETED = 'deleted',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'outOfStock',
  INSUFFICIENT_STOCK = 'insufficientStock',
}


/** Customer-safe product snapshot nested on a cart line. */
export type CartProductView = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  images: string[];
  status: string;
  ratingsAverage: number;
  ratingsQuantity: number;
  showOnBanner: boolean;
  optionDefinitions: ProductOptionDefinition[];
};

/** Customer-safe variant snapshot nested on a cart line. */
export type CartVariantView = {
  _id: Types.ObjectId;
  sku: string;
  price: number;
  priceAfterDiscount: number;
  status: string;
  isDefault: boolean;
  options: Record<string, string>;
  unit: string;
  order: number;
  images: string[];
};

/**
 * Read-model for one cart line — computed on every read, never persisted
 * (except `unitPriceAtAdd` / `productNameAtAdd`, which live on the document).
 *
 * `variant` / `product` are populated objects when the documents still exist.
 * If the variant row itself is gone, `variant` falls back to the stored ObjectId.
 */
export interface CartItemView {
  variant: CartVariantView | Types.ObjectId;
  product: CartProductView | null;
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
