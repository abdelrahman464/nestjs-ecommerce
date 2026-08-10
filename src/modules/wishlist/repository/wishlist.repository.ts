import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PRODUCT_PUBLIC_FIELDS,
  VARIANT_PUBLIC_FIELDS,
} from '../../products/constants/product.constants';
import { Wishlist, WishlistDocument } from '../schemas/wishlist.schema';

@Injectable()
export class WishlistRepository {
  constructor(
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
  ) {}

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

  async findByUserId(userId: string): Promise<WishlistDocument | null> {
    return this.wishlistModel
      .findOne({ user: userId })
      .populate(WishlistRepository.populate)
      .exec();
  }

  async createForUser(userId: string): Promise<WishlistDocument> {
    return this.wishlistModel.create({
      user: new Types.ObjectId(userId),
      items: [],
    });
  }

  async save(wishlist: WishlistDocument): Promise<WishlistDocument> {
    await wishlist.save();
    return wishlist.populate(WishlistRepository.populate);
  }
}
