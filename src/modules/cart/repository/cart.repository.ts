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

  private static readonly populate = [
    {
      path: 'items.variant',
      select: VARIANT_PUBLIC_FIELDS,
      populate: {
        path: 'product',
        select: PRODUCT_PUBLIC_FIELDS,
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
