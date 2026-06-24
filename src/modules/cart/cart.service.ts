import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductStatus } from '../products/enums/product-status.enum';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartRepository } from './repository/cart.repository';
import { CartDocument, CartItem } from './schemas/cart.schema';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
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
    const product = await this.getAvailableProduct(dto.productId);
    const cart = await this.getOrCreateCart(userId);
    // Find the existing item in the cart
    const existing = cart.items.find(
      (item) => item.product.toString() === dto.productId,
    );

    // Calculate the next quantity
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;
    // If the next quantity is greater than the product stock, throw an error
    if (nextQuantity > product.stock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: product.stock },
      );
    }
    // If the item exists, update the quantity
    if (existing) {
      existing.quantity = nextQuantity;
    } else {
      cart.items.push({
        product: product._id,
        quantity: dto.quantity,
      } as CartItem);
    }

    return this.cartRepository.save(cart);
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartDocument> {
    const product = await this.getAvailableProduct(productId);
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find(
      (entry) => entry.product.toString() === productId,
    );

    if (!item) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'cart.itemNotFound', {
        productId,
      });
    }

    if (dto.quantity > product.stock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: product.stock },
      );
    }

    item.quantity = dto.quantity;
    return this.cartRepository.save(cart);
  }

  async removeItem(userId: string, productId: string): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId,
    );

    if (cart.items.length === initialLength) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'cart.itemNotFound', {
        productId,
      });
    }

    return this.cartRepository.save(cart);
  }

  async clearCart(userId: string): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);
    cart.items = [];
    return this.cartRepository.save(cart);
  }

  /**
   * Merge client-side cart items (e.g. from localStorage) into the user's server cart.
   * Call this once after login/register.
   */
  async syncCart(userId: string, dto: SyncCartDto): Promise<CartDocument> {
    if (!dto.items.length) {
      return this.getOrCreateCart(userId);
    }

    const cart = await this.getOrCreateCart(userId);

    for (const incoming of dto.items) {
      const product = await this.productModel
        .findById(incoming.productId)
        .exec();
      if (
        !product ||
        product.status === ProductStatus.INACTIVE ||
        product.status === ProductStatus.OUT_OF_STOCK ||
        product.stock <= 0
      ) {
        continue;
      }

      const existing = cart.items.find(
        (item) => item.product.toString() === incoming.productId,
      );
      const mergedQuantity = (existing?.quantity ?? 0) + incoming.quantity;
      const finalQuantity = Math.min(mergedQuantity, product.stock);

      if (finalQuantity <= 0) continue;

      if (existing) {
        existing.quantity = finalQuantity;
      } else {
        cart.items.push({
          product: product._id,
          quantity: finalQuantity,
        } as CartItem);
      }
    }

    return this.cartRepository.save(cart);
  }

  private async getAvailableProduct(
    productId: string,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();
    if (!product) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'cart.productNotFound',
        {
          id: productId,
        },
      );
    }
    if (
      product.status === ProductStatus.INACTIVE ||
      product.status === ProductStatus.OUT_OF_STOCK ||
      product.stock <= 0
    ) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.productUnavailable',
      );
    }
    return product as unknown as ProductDocument;
  }
}
