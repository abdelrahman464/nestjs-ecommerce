import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Order } from '../../orders/schemas/order.schema';
import { User } from '../../users/schemas/user.schema';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';


@Schema({ timestamps: true })
export class Payment {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Order.name,
    required: true,
  })
  order: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    default: null,
  })
  reservation?: Types.ObjectId | null;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0 })
  deliveryFee: number;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: PaymentProvider, required: true })
  provider: PaymentProvider;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ required: true, uppercase: true, trim: true })
  currency: string;

  //ID from the payment provider for this checkout session
  @Prop({ type: String, index: true, sparse: true })
  providerReference?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  /** Proof images when admin marks a manual payment as paid. */
  @Prop({ type: [String], default: [] })
  images?: string[];

  @Prop({ trim: true })
  note?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    default: null,
  })
  paidBy?: Types.ObjectId | null;

  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ user: 1, status: 1 });
PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ order: 1, createdAt: -1 });
