import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { OrderSource, OrderStatus } from '../enums/order.enums';
import { OrderItem, OrderItemSchema } from './order-item.schema';

/**
 * Thin order document — inventory sales use referenceId = order._id.
 * Reservation + payment are required links created at checkout / manual order.
 */
@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  /** Customer who receives the goods. */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user: Types.ObjectId;

  /**
   * Who opened the order:
   * - checkout → same as user (self-serve)
   * - manual_order → admin/manager
   */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  createdBy: Types.ObjectId;

  @Prop({ type: String, enum: OrderSource, required: true })
  source: OrderSource;

  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0 })
  deliveryFee: number;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, trim: true })
  currency: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null,
  })
  payment?: Types.ObjectId | null;

  /** Set after reservation is created (same checkout TX). */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    default: null,
  })
  reservation?: Types.ObjectId | null;

  @Prop({ trim: true })
  note?: string;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ createdBy: 1, createdAt: -1 });
OrderSchema.index({ user: 1, status: 1 });
