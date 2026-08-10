import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { CartService } from '../cart/cart.service';
import { ReservationsService } from '../inventory/reservations.service';
import { ProductStatus } from '../products/enums/product-status.enum';
import { ProductVariantRepository } from '../products/repository/product-variants.repository';
import { ProductRepository } from '../products/repository/products.repository';
import { ProductDocument } from '../products/schemas/product.schema';
import { ProductVariantDocument } from '../products/schemas/product-variant.schema';
import { resolveVariantUnitPrice } from '../products/utils/pricing.util';
import { WISHLIST_MAX_ITEMS } from './constants/wishlist.constants';
import { WishlistRepository } from './repository/wishlist.repository';
import { WishlistDocument, WishlistItem } from './schemas/wishlist.schema';
import {
  WishlistItemUnavailableReason,
  WishlistItemView,
  WishlistView,
} from './types/wishlist-view.type';

@Injectable()
export class WishlistService {
  constructor(
    private readonly wishlistRepository: WishlistRepository,
    private readonly variantRepository: ProductVariantRepository,
    private readonly productRepository: ProductRepository,
    private readonly reservationsService: ReservationsService,
    private readonly cartService: CartService,
  ) {}

  async getWishlist(userId: string): Promise<WishlistView> {
    const wishlist = await this.getOrCreate(userId);
    return this.buildView(wishlist);
  }

  async addItem(userId: string, variantId: string): Promise<WishlistView> {
    await this.assertVariantWishable(variantId);

    const wishlist = await this.getOrCreate(userId);
    const already = wishlist.items.some(
      (item) => this.getItemVariantId(item) === variantId,
    );
    if (already) {
      return this.buildView(wishlist);
    }

    if (wishlist.items.length >= WISHLIST_MAX_ITEMS) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'wishlist.maxItemsExceeded',
        { max: WISHLIST_MAX_ITEMS },
      );
    }

    wishlist.items.push({
      variant: new Types.ObjectId(variantId),
      addedAt: new Date(),
    } as WishlistItem);

    const saved = await this.wishlistRepository.save(wishlist);
    return this.buildView(saved);
  }

  async removeItem(userId: string, variantId: string): Promise<WishlistView> {
    const wishlist = await this.getOrCreate(userId);
    const before = wishlist.items.length;
    wishlist.items = wishlist.items.filter(
      (item) => this.getItemVariantId(item) !== variantId,
    );
    if (wishlist.items.length === before) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'wishlist.itemNotFound',
        { variantId },
      );
    }
    const saved = await this.wishlistRepository.save(wishlist);
    return this.buildView(saved);
  }

  async clear(userId: string): Promise<WishlistView> {
    const wishlist = await this.getOrCreate(userId);
    wishlist.items = [];
    const saved = await this.wishlistRepository.save(wishlist);
    return this.buildView(saved);
  }

  /**
   * Add the variant to the cart (qty 1) then remove it from the wishlist.
   * Cart still enforces stock / max qty — failures leave the wishlist item.
   */
  async moveToCart(userId: string, variantId: string): Promise<WishlistView> {
    const wishlist = await this.getOrCreate(userId);
    const exists = wishlist.items.some(
      (item) => this.getItemVariantId(item) === variantId,
    );
    if (!exists) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'wishlist.itemNotFound',
        { variantId },
      );
    }

    await this.cartService.addItem(userId, { variantId, quantity: 1 });
    return this.removeItem(userId, variantId);
  }

  private async getOrCreate(userId: string): Promise<WishlistDocument> {
    return (
      (await this.wishlistRepository.findByUserId(userId)) ??
      (await this.wishlistRepository.createForUser(userId))
    );
  }

  /** Exist + not soft-deleted + product not inactive. OOS is allowed on wishlist. */
  private async assertVariantWishable(variantId: string): Promise<void> {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.variantNotFound',
        { id: variantId },
      );
    }

    const product = await this.productRepository.findById(variant.product);
    if (!product) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
        id: String(variant.product),
      });
    }
    if (
      product.status === ProductStatus.INACTIVE ||
      variant.status === ProductStatus.INACTIVE
    ) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.variantUnavailable',
      );
    }
  }

  private async buildView(wishlist: WishlistDocument): Promise<WishlistView> {
    const items: WishlistItemView[] = [];
    for (const item of wishlist.items) {
      items.push(await this.assessItem(item));
    }

    const { _id, user, createdAt, updatedAt } = wishlist as WishlistDocument & {
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      _id,
      user,
      items,
      itemsCount: items.length,
      createdAt,
      updatedAt,
    };
  }

  private async assessItem(item: WishlistItem): Promise<WishlistItemView> {
    const populatedVariant = item.variant as
      | Types.ObjectId
      | ProductVariantDocument;
    const variant =
      populatedVariant instanceof Types.ObjectId ? null : populatedVariant;

    if (!variant) {
      return {
        variant: this.getRawVariantId(populatedVariant),
        product: null,
        addedAt: item.addedAt,
        unitPrice: 0,
        available: false,
        unavailableReason: WishlistItemUnavailableReason.DELETED,
        availableQuantity: 0,
      };
    }

    const populatedProduct = variant.product as
      | Types.ObjectId
      | ProductDocument;
    const product =
      populatedProduct instanceof Types.ObjectId ? null : populatedProduct;

    const isDeleted =
      variant.deletedAt != null || !product || product.deletedAt != null;
    const isInactive =
      !isDeleted &&
      (variant.status === ProductStatus.INACTIVE ||
        product.status === ProductStatus.INACTIVE);
    const isOutOfStock =
      !isDeleted &&
      !isInactive &&
      (variant.status === ProductStatus.OUT_OF_STOCK || variant.stock <= 0);

    let availableQuantity = 0;
    if (!isDeleted) {
      const availability = await this.reservationsService.getAvailability(
        variant._id.toString(),
      );
      availableQuantity = availability.available;
    }

    let unavailableReason: WishlistItemUnavailableReason | undefined;
    if (isDeleted) unavailableReason = WishlistItemUnavailableReason.DELETED;
    else if (isInactive)
      unavailableReason = WishlistItemUnavailableReason.INACTIVE;
    else if (isOutOfStock || availableQuantity <= 0)
      unavailableReason = WishlistItemUnavailableReason.OUT_OF_STOCK;

    return {
      variant: variant._id,
      product: product?._id ?? null,
      addedAt: item.addedAt,
      sku: variant.sku,
      productName: product
        ? (getLocalizedValue(product.title as never, DEFAULT_CONTENT_LOCALE) ??
          undefined)
        : undefined,
      unitPrice: isDeleted ? 0 : resolveVariantUnitPrice(variant),
      available: !unavailableReason,
      unavailableReason,
      availableQuantity,
    };
  }

  private getItemVariantId(item: WishlistItem): string {
    const variant = item.variant as Types.ObjectId | ProductVariantDocument;
    if (variant instanceof Types.ObjectId) return variant.toString();
    return variant._id.toString();
  }

  private getRawVariantId(
    variant: Types.ObjectId | ProductVariantDocument,
  ): Types.ObjectId {
    return variant instanceof Types.ObjectId ? variant : variant._id;
  }
}
