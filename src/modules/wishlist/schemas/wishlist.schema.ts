import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { ProductVariant } from '../../products/schemas/product-variant.schema';
import { User } from '../../users/schemas/user.schema';

@Schema({ _id: false })
export class WishlistItem {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  addedAt: Date;
}

export const WishlistItemSchema = SchemaFactory.createForClass(WishlistItem);

@Schema({ timestamps: true, collection: 'wishlists' })
export class Wishlist {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
  })
  user: Types.ObjectId;

  @Prop({ type: [WishlistItemSchema], default: [] })
  items: WishlistItem[];
}

export type WishlistDocument = HydratedDocument<Wishlist>;
export const WishlistSchema = SchemaFactory.createForClass(Wishlist);
