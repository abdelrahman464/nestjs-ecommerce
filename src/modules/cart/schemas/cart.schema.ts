import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { ProductVariant } from '../../products/schemas/product-variant.schema';

@Schema({ _id: false })
export class CartItem {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;

  /**
   * Snapshot taken whenever this line's quantity is set (add / merge / update).
   * Never used for billing (checkout always re-prices live) — only lets the
   * cart flag "price changed since you added this" without an extra lookup.
   */
  @Prop({ required: true, min: 0 })
  unitPriceAtAdd: number;

  @Prop({ required: true, trim: true })
  productNameAtAdd: string;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ timestamps: true })
export class Cart {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
  })
  user: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];
}

export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
