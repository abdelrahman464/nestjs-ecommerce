import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VARIANT_PUBLIC_FIELDS } from '../../products/constants/product.constants';
import { PRODUCT_PUBLIC_FIELDS } from '../../products/constants/product.constants';
import { Cart, CartDocument } from '../schemas/cart.schema';

@Injectable()
export class CartRepository {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
  ) {}

  /**
   * `deletedAt` is appended (not part of the public field lists) so the
   * service can detect soft-deleted variants/products for availability
   * checks. It is never returned as-is — responses go through `CartView`.
   */
  private static readonly populate = [
    {
      path: 'items.variant',
      select: `${VARIANT_PUBLIC_FIELDS} deletedAt`,
      populate: {
        path: 'product',
        select: `${PRODUCT_PUBLIC_FIELDS} deletedAt`,
      },
    },
  ];

  async findByUserId(userId: string): Promise<CartDocument | null> {
    return this.cartModel
      .findOne({ user: userId })
      .populate(CartRepository.populate)
      .exec();
  }

  async createUserCart(userId: string): Promise<CartDocument> {
    return this.cartModel.create({
      user: new Types.ObjectId(userId),
      items: [],
    });
  }

  async save(cart: CartDocument): Promise<CartDocument> {
    await cart.save();
    return cart.populate(CartRepository.populate);
  }
}
