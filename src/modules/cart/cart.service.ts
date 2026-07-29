import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { ProductVariantsService } from '../products/product-variants.service';
import { ProductVariantDocument } from '../products/schemas/product-variant.schema';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartRepository } from './repository/cart.repository';
import { CartDocument, CartItem } from './schemas/cart.schema';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly variantsService: ProductVariantsService,
  ) {}

  async getOrCreateCart(userId: string): Promise<CartDocument> {
    return (
      (await this.cartRepository.findByUserId(userId)) ??
      (await this.cartRepository.createUserCart(userId))
    );
  }

  async getCart(userId: string): Promise<CartDocument> {
    return this.getOrCreateCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartDocument> {
    const variant = await this.variantsService.findAvailableById(dto.variantId);
    const cart = await this.getOrCreateCart(userId);
    this.applyAddItem(cart, variant, dto.quantity);
    return this.cartRepository.save(cart);
  }

  async addItemsBulk(
    userId: string,
    items: AddCartItemDto[],
  ): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);

    for (const item of items) {
      const variant = await this.variantsService.findAvailableById(
        item.variantId,
      );
      this.applyAddItem(cart, variant, item.quantity);
    }

    return this.cartRepository.save(cart);
  }

  async updateItem(
    userId: string,
    variantId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartDocument> {
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

    if (dto.quantity > variant.stock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: variant.stock },
      );
    }

    item.quantity = dto.quantity;
    cart.markModified('items');
    return this.cartRepository.save(cart);
  }

  async removeItem(userId: string, variantId: string): Promise<CartDocument> {
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

    return this.cartRepository.save(cart);
  }

  async clearCart(userId: string): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);
    cart.items = [];
    return this.cartRepository.save(cart);
  }

  private applyAddItem(
    cart: CartDocument,
    variant: ProductVariantDocument,
    quantity: number,
  ): void {
    const variantId = variant._id.toString();
    const existing = cart.items.find(
      (item) => this.getItemVariantId(item) === variantId,
    );

    const nextQuantity = existing
      ? existing.quantity + quantity
      : quantity;

    if (nextQuantity > variant.stock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: variant.stock },
      );
    }

    if (existing) {
      existing.quantity = nextQuantity;
      cart.markModified('items');
    } else {
      cart.items.push({
        variant: variant._id,
        quantity,
      } as CartItem);
    }
  }

  private getItemVariantId(item: CartItem): string {
    const variant = item.variant as Types.ObjectId | ProductVariantDocument;
    if (variant instanceof Types.ObjectId) {
      return variant.toString();
    }
    return variant._id.toString();
  }
}
