import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Order } from '../../orders/schemas/order.schema';
import { Payment } from '../../payments/schemas/payment.schema';
import { User } from '../../users/schemas/user.schema';
import {
  ReservationSource,
  ReservationStatus,
} from '../enums/reservation.enums';
import {
  ReservationLine,
  ReservationLineSchema,
} from './reservation-line.schema';

/**
 * Stock hold for one order until paid, cancelled, or TTL expiry.
 * lines[] = allocation (which warehouse contributes how many units).
 */
@Schema({ timestamps: true, collection: 'inventory_reservations' })
export class InventoryReservation {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user: Types.ObjectId;

  /** Customer (checkout) or admin (manual_order)  */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  createdBy: Types.ObjectId;

  @Prop({ type: String, enum: ReservationSource, required: true })
  source: ReservationSource;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Order.name,
    required: true,
  })
  order: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Payment.name,
    required: true,
  })
  payment: Types.ObjectId;

  @Prop({
    type: String,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: [ReservationLineSchema], required: true })
  lines: ReservationLine[];

  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  @Prop({ type: Date, default: null })
  releasedAt?: Date | null;
}

export type InventoryReservationDocument =
  HydratedDocument<InventoryReservation>;

export const InventoryReservationSchema = SchemaFactory.createForClass(
  InventoryReservation,
);

InventoryReservationSchema.index({ order: 1 }, { unique: true });
InventoryReservationSchema.index({ payment: 1 }, { unique: true });
InventoryReservationSchema.index({ status: 1, expiresAt: 1 });
InventoryReservationSchema.index({ user: 1, createdAt: -1 });
