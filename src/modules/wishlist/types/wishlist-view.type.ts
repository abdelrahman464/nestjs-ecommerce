import { Types } from 'mongoose';

export enum WishlistItemUnavailableReason {
  DELETED = 'deleted',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'outOfStock',
}

export type WishlistItemView = {
  variant: Types.ObjectId;
  product: Types.ObjectId | null;
  addedAt: Date;
  sku?: string;
  productName?: string;
  unitPrice: number;
  available: boolean;
  unavailableReason?: WishlistItemUnavailableReason;
  availableQuantity: number;
};

export type WishlistView = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: WishlistItemView[];
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
};
