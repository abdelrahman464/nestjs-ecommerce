import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ReservationSource, ReservationStatus } from '../enums/reservation.enums';
import {
  InventoryReservation,
  InventoryReservationDocument,
} from '../schemas/inventory-reservation.schema';
import { ReservationLine } from '../schemas/reservation-line.schema';

export type CreateReservationParams = {
  user: Types.ObjectId;
  createdBy: Types.ObjectId;
  source: ReservationSource;
  order: Types.ObjectId;
  payment: Types.ObjectId;
  status: ReservationStatus;
  expiresAt: Date;
  lines: ReservationLine[];
};

@Injectable()
export class ReservationsRepository {
  constructor(
    @InjectModel(InventoryReservation.name)
    private readonly reservationModel: Model<InventoryReservationDocument>,
  ) {}

  async create(
    params: CreateReservationParams,
    session?: ClientSession,
  ): Promise<InventoryReservationDocument> {
    const [doc] = await this.reservationModel.create(
      { ...params },
      { session },
    );
    return doc;
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel.findById(id).exec();
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel
      .findOne({ order: orderId })
      .session(session ?? null)
      .exec();
  }

  async findByPaymentId(
    paymentId: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel.findOne({ payment: paymentId }).exec();
  }

  /** True if any of these variants has a pending (not yet confirmed/released/expired) reservation line. */
  async existsPendingForVariants(
    variantIds: Array<Types.ObjectId | string>,
  ): Promise<boolean> {
    if (!variantIds.length) return false;
    const count = await this.reservationModel
      .countDocuments({
        status: ReservationStatus.PENDING,
        'lines.variant': { $in: variantIds },
      })
      .exec();
    return count > 0;
  }

  async updateStatus(
    id: Types.ObjectId | string,
    status: ReservationStatus,
    extra: { confirmedAt?: Date; releasedAt?: Date } = {},
    session?: ClientSession,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel
      .findByIdAndUpdate(
        id,
        { $set: { status, ...extra } },
        { new: true, session },
      )
      .exec();
  }
}
