import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentItem, PaymentItemSchema } from './payment-item.schema';

@Schema({ timestamps: true })
export class Payment {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user: Types.ObjectId;

  @Prop({ type: [PaymentItemSchema], required: true })
  items: PaymentItem[];

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

  @Prop({ type: String, index: true, sparse: true })
  providerReference?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ user: 1, status: 1 });
PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
