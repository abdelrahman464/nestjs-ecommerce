import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductStatus } from '../products/enums/product-status.enum';
import { AddCartItemDto } from './dto/add-cart-item.dto';
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
    this.applyAddItem(cart, product, dto.productId, dto.quantity);
    return this.cartRepository.save(cart);
  }

  async addItemsBulk(
    userId: string,
    items: AddCartItemDto[],
  ): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);

    for (const item of items) {
      const product = await this.getAvailableProduct(item.productId);
      this.applyAddItem(cart, product, item.productId, item.quantity);
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
      (entry) => this.getItemProductId(entry) === productId,
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
    cart.markModified('items');
    return this.cartRepository.save(cart);
  }

  async removeItem(userId: string, productId: string): Promise<CartDocument> {
    const cart = await this.getOrCreateCart(userId);
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      (item) => this.getItemProductId(item) !== productId,
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

  private applyAddItem(
    cart: CartDocument,
    product: ProductDocument,
    productId: string,
    quantity: number,
  ): void {
    const existing = cart.items.find(
      (item) => this.getItemProductId(item) === productId,
    );

    const nextQuantity = existing
      ? existing.quantity + quantity
      : quantity;

    if (nextQuantity > product.stock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'cart.insufficientStock',
        { available: product.stock },
      );
    }

    if (existing) {
      existing.quantity = nextQuantity;
      cart.markModified('items');
    } else {
      cart.items.push({
        product: product._id,
        quantity,
      } as CartItem);
    }
  }

  private async getAvailableProduct(
    productId: string,
  ): Promise<ProductDocument> {
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .exec();
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

  private getItemProductId(item: CartItem): string {
    const product = item.product as Types.ObjectId | ProductDocument;
    if (product instanceof Types.ObjectId) {
      return product.toString();
    }
    return product._id.toString();
  }
}
