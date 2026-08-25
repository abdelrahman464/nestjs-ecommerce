import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { ReservationsService } from '../inventory/reservations.service';
import { ProductVariantsService } from '../products/product-variants.service';
import { ProductStatus } from '../products/enums/product-status.enum';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductVariantDocument } from '../products/schemas/product-variant.schema';
import { resolveVariantUnitPrice } from '../products/utils/pricing.util';
import { resolveLocalizedTitle } from '../products/utils/product-populate.util';
import { CART_MAX_ITEM_QUANTITY } from './constants/cart.constants';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartRepository } from './repository/cart.repository';
import { CartDocument, CartItem } from './schemas/cart.schema';
import {
  CartItemUnavailableReason,
  CartItemView,
  CartProductView,
  CartVariantView,
  CartView,
} from './types/cart-view.type';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly variantsService: ProductVariantsService,
    private readonly reservationsService: ReservationsService,
    private readonly configService: ConfigService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async getCart(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    return this.buildView(cart);
  }

  /**
   * Raw populated document for internal orchestration (checkout item
   * building), which re-validates every line itself via `findAvailableById`
   * + `getAvailability` and doesn't need the display-oriented `CartView`.
   */
  async getCartDocument(userId: string): Promise<CartDocument> {
    return this.getOrCreateCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartView> {
    return this.withRetry(async () => {
      const variant = await this.variantsService.findAvailableById(
        dto.variantId,
      );
      const cart = await this.getOrCreateCart(userId);
      await this.applyAddItem(cart, variant, dto.quantity);
      const saved = await this.cartRepository.save(cart);
      return this.buildView(saved);
    });
  }

  async addItemsBulk(
    userId: string,
    items: AddCartItemDto[],
  ): Promise<CartView> {
    return this.withRetry(async () => {
      const cart = await this.getOrCreateCart(userId);

      for (const item of items) {
        const variant = await this.variantsService.findAvailableById(
          item.variantId,
        );
        await this.applyAddItem(cart, variant, item.quantity);
      }

      const saved = await this.cartRepository.save(cart);
      return this.buildView(saved);
    });
  }

  async updateItem(
    userId: string,
    variantId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartView> {
    return this.withRetry(async () => {
      if (dto.quantity > CART_MAX_ITEM_QUANTITY) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'cart.quantityExceedsMax',
          { max: CART_MAX_ITEM_QUANTITY },
        );
      }

      const variant = await this.variantsService.findAvailableById(variantId);
      const cart = await this.getOrCreateCart(userId);
      const item = cart.items.find(
        (entry) => this.getItemVariantId(entry) === variantId,
      );

      if (!item) {
        throw new I18nHttpException(HttpStatus.NOT_FOUND, 'cart.itemNotFound', {
          productId: variantId,
        });
      }

      const availability =
        await this.reservationsService.getAvailability(variantId);
      if (dto.quantity > availability.available) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'cart.insufficientStock',
          { available: availability.available },
        );
      }

      // Re-stamp the snapshot: the user just re-confirmed this line at today's price.
      const product = await this.productModel
        .findOne({ _id: variant.product, deletedAt: null })
        .exec();
      item.quantity = dto.quantity;
      item.unitPriceAtAdd = resolveVariantUnitPrice(variant);
      item.productNameAtAdd = this.resolveProductName(product);
      cart.markModified('items'); // without markModified, Mongoose may skip `items`

      const saved = await this.cartRepository.save(cart);
      return this.buildView(saved);
    });
  }

  async removeItem(userId: string, variantId: string): Promise<CartView> {
    return this.withRetry(async () => {
      const cart = await this.getOrCreateCart(userId);
      const initialLength = cart.items.length;
      cart.items = cart.items.filter(
        (item) => this.getItemVariantId(item) !== variantId,
      );

      if (cart.items.length === initialLength) {
        throw new I18nHttpException(HttpStatus.NOT_FOUND, 'cart.itemNotFound', {
          productId: variantId,
        });
      }

      const saved = await this.cartRepository.save(cart);
      return this.buildView(saved);
    });
  }

  async clearCart(userId: string): Promise<CartView> {
    return this.withRetry(async () => {
      const cart = await this.getOrCreateCart(userId);
      cart.items = [];
      const saved = await this.cartRepository.save(cart);
      return this.buildView(saved);
    });
  }

  private async getOrCreateCart(userId: string): Promise<CartDocument> {
    return (
      (await this.cartRepository.findByUserId(userId)) ??
      (await this.cartRepository.createUserCart(userId))
    );
  }

  private async applyAddItem(
    cart: CartDocument,
    variant: ProductVariantDocument,
    quantity: number,
  ): Promise<void> {
    const variantId = variant._id.toString();
    const existing = cart.items.find(
      (item) => this.getItemVariantId(item) === variantId,
    );

    const nextQuantity = existing ? existing.quantity + quantity : quantity;

    if (nextQuantity > CART_MAX_ITEM_QUANTITY) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.quantityExceedsMax',
        { max: CART_MAX_ITEM_QUANTITY },
      );
    }

    const availability =
      await this.reservationsService.getAvailability(variantId);
    if (nextQuantity > availability.available) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: availability.available },
      );
    }

    // Re-stamp the snapshot on every touch (create or merge) — it's the
    // price the user last saw for this line, used only for drift detection.
    const product = await this.productModel
      .findOne({ _id: variant.product, deletedAt: null })
      .exec();
    const unitPriceAtAdd = resolveVariantUnitPrice(variant);
    const productNameAtAdd = this.resolveProductName(product);

    if (existing) {
      existing.quantity = nextQuantity;
      existing.unitPriceAtAdd = unitPriceAtAdd;
      existing.productNameAtAdd = productNameAtAdd;
      cart.markModified('items');
    } else {
      cart.items.push({
        variant: variant._id,
        quantity,
        unitPriceAtAdd,
        productNameAtAdd,
      } as CartItem);
    }
  }

  private resolveProductName(
    product: Pick<ProductDocument, 'title'> | null,
  ): string {
    if (!product) return 'Product';
    return (
      getLocalizedValue(product.title, DEFAULT_CONTENT_LOCALE) ?? 'Product'
    );
  }

  private getItemVariantId(item: CartItem): string {
    const variant = item.variant as Types.ObjectId | ProductVariantDocument;
    return this.isPopulatedVariant(variant)
      ? variant._id.toString()
      : String(variant);
  }

  /**
   * Cart writes mutate the `items` array, which Mongoose versions by default —
   * two concurrent requests on the same cart (double-click, two tabs) make the
   * loser's `.save()` throw `VersionError`. Retry once against fresh state
   * (re-reads the cart, re-validates availability); a second collision means
   * genuine contention, so surface a clean 409 instead of a raw 500.
   * TRY:
        execute the cart operation
        IF it succeeds:
            return the result
        IF it fails:
            IF it wasn't a VersionError:
                throw the original error
            OTHERWISE:
                try the operation again
                IF retry succeeds:
                    return the result
                IF retry is another VersionError:
                    return 409 Conflict
                OTHERWISE:
                    throw the original error
----------------------------------------------------------
You:       Open document version 1
Another:   Open document version 1
Another:   Saves → version 2
You:       Try to save version 1
           ↓
           ❌ VersionError
You:       "Okay, I'll try again."
You:       Load/use latest version
           ↓
           Save
           ↓
           ✅ Success        
----------------------------------------------------------
real example from our business
Tab A: addItem(V1, qty 1)
Tab B: addItem(V1, qty 1)
------------------------------------------------------------
Tab A → withRetry → attempt 1 → fn():
    getOrCreateCart()        → reads cart  { __v: 5, items: [{ V1, quantity: 2 }] }
    applyAddItem()           → nextQuantity = 2 + 1 = 3
    cart.save()              → Mongo checks filter { _id, __v: 5 } → MATCH
                              → writes quantity: 3, bumps to __v: 6
                              ✅ success → Tab A sees "V1 quantity: 3"
Tab B → withRetry → attempt 1 → fn():
    getOrCreateCart()        → reads cart  { __v: 5, items: [{ V1, quantity: 2 }] }
                                (read happened before Tab A's save landed)
    applyAddItem()           → nextQuantity = 2 + 1 = 3
    cart.save()              → Mongo checks filter { _id, __v: 5 } → NO MATCH
                                (real doc is now __v: 6, from Tab A)
                              ❌ VersionError
    withRetry catches it, doesn't rethrow → falls through to attempt 2
Tab B → withRetry → attempt 2 → fn():
    getOrCreateCart()        → reads cart  { __v: 6, items: [{ V1, quantity: 3 }] }
                                (fresh read — now sees Tab A's change)
    applyAddItem()           → existing found → nextQuantity = 3 + 1 = 4
    cart.save()              → filter { _id, __v: 6 } → MATCH
                              → writes quantity: 4, bumps to __v: 7
                              ✅ success → Tab B sees "V1 quantity: 4"         
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError)) throw error;
    }
    try {
      return await fn();
    } catch (error) {
      if (error instanceof mongoose.Error.VersionError) {
        throw new I18nHttpException(HttpStatus.CONFLICT, 'cart.conflict');
      }
      throw error;
    }
  }

  /** Enriches the persisted cart into the read-model returned by the API. */
  private async buildView(cart: CartDocument): Promise<CartView> {
    const currency =
      this.configService.get<string>('payment.defaultCurrency') ?? 'EUR';

    let itemsCount = 0;
    let subtotal = 0;
    const items: CartItemView[] = [];

    for (const item of cart.items) {
      itemsCount += item.quantity;
      const view = await this.assessItem(item);
      if (view.available) subtotal += view.lineSubtotal;
      items.push(view);
    }

    const { _id, user, createdAt, updatedAt } = cart as CartDocument & {
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      _id,
      user,
      items,
      itemsCount,
      subtotal,
      currency,
      createdAt,
      updatedAt,
    };
  }

  
  private async assessItem(item: CartItem): Promise<CartItemView> {
    const populatedVariant = item.variant as
      | Types.ObjectId
      | ProductVariantDocument;
    const variant = this.isPopulatedVariant(populatedVariant)
      ? populatedVariant
      : null;

    if (!variant) {
      return {
        variant: this.getRawVariantId(populatedVariant),
        product: null,
        quantity: item.quantity,
        unitPriceAtAdd: item.unitPriceAtAdd,
        productNameAtAdd: item.productNameAtAdd,
        currentUnitPrice: item.unitPriceAtAdd,
        priceChanged: false,
        available: false,
        unavailableReason: CartItemUnavailableReason.DELETED,
        availableQuantity: 0,
        lineSubtotal: 0,
      };
    }

    const populatedProduct = variant.product as
      | Types.ObjectId
      | ProductDocument;
    const product = this.isPopulatedProduct(populatedProduct)
      ? populatedProduct
      : null;

    const isDeleted =
      variant.deletedAt != null || !product || product.deletedAt != null;
    const isInactive =
      !isDeleted &&
      (variant.status === ProductStatus.INACTIVE ||
        product.status === ProductStatus.INACTIVE);
    const isOutOfStockCache =
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

    const currentUnitPrice = isDeleted
      ? item.unitPriceAtAdd
      : resolveVariantUnitPrice(variant);
    const priceChanged = !isDeleted && currentUnitPrice !== item.unitPriceAtAdd;

    let unavailableReason: CartItemUnavailableReason | undefined;
    if (isDeleted) unavailableReason = CartItemUnavailableReason.DELETED;
    else if (isInactive) unavailableReason = CartItemUnavailableReason.INACTIVE;
    else if (isOutOfStockCache)
      unavailableReason = CartItemUnavailableReason.OUT_OF_STOCK;
    else if (item.quantity > availableQuantity)
      unavailableReason = CartItemUnavailableReason.INSUFFICIENT_STOCK;

    const available = !unavailableReason;

    return {
      variant: this.toVariantView(variant),
      product: product ? this.toProductView(product) : null,
      quantity: item.quantity,
      unitPriceAtAdd: item.unitPriceAtAdd,
      productNameAtAdd: item.productNameAtAdd,
      currentUnitPrice,
      priceChanged,
      available,
      unavailableReason,
      availableQuantity,
      lineSubtotal: available ? currentUnitPrice * item.quantity : 0,
    };
  }

  private isPopulatedVariant(
    value: Types.ObjectId | ProductVariantDocument,
  ): value is ProductVariantDocument {
    return typeof value === 'object' && value !== null && 'sku' in value;
  }

  private isPopulatedProduct(
    value: Types.ObjectId | ProductDocument | null | undefined,
  ): value is ProductDocument {
    return typeof value === 'object' && value !== null && 'slug' in value;
  }

  private toVariantView(variant: ProductVariantDocument): CartVariantView {
    return {
      _id: variant._id,
      sku: variant.sku,
      price: variant.price,
      priceAfterDiscount: variant.priceAfterDiscount,
      status: variant.status,
      isDefault: variant.isDefault,
      options: this.optionsToRecord(variant.options),
      unit: variant.unit,
      order: variant.order,
      images: variant.images ?? [],
    };
  }

  private toProductView(product: ProductDocument): CartProductView {
    return {
      _id: product._id,
      title: resolveLocalizedTitle(product) ?? 'Product',
      slug: product.slug,
      images: product.images ?? [],
      status: product.status,
      ratingsAverage: product.ratingsAverage,
      ratingsQuantity: product.ratingsQuantity,
      showOnBanner: product.showOnBanner,
      optionDefinitions: product.optionDefinitions ?? [],
    };
  }

 

  private isNamedRef(
    value: unknown,
  ): value is {
    _id: Types.ObjectId;
    title?: unknown;
    slug: string;
    image?: string;
    logo?: string;
  } {
    return typeof value === 'object' && value !== null && 'slug' in value;
  }

  private optionsToRecord(
    options: ProductVariantDocument['options'] | undefined,
  ): Record<string, string> {
    if (!options) return {};
    if (options instanceof Map) return Object.fromEntries(options);
    return { ...(options as Record<string, string>) };
  }

  private getRawVariantId(
    variant: Types.ObjectId | ProductVariantDocument,
  ): Types.ObjectId {
    return this.isPopulatedVariant(variant) ? variant._id : variant;
  }
}
