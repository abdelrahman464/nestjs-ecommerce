import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { Payment, PaymentDocument } from '../schemas/payment.schema';
import { PAYMENT_SEARCH_FIELDS } from '../constants/payment.constants';

export interface CreatePaymentPayload {
  user: Types.ObjectId | string;
  order: Types.ObjectId | string;
  subtotal: number;
  deliveryFee: number;
  amount: number;
  provider: PaymentProvider;
  currency: string;
  status?: PaymentStatus;
  reservation?: Types.ObjectId | string;
}

@Injectable()
export class PaymentRepository {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  private static readonly populate = [
    { path: 'user', select: USER_PUBLIC_FIELDS },
    { path: 'order' },
  ];

  async create(
    data: CreatePaymentPayload,
    session?: ClientSession,
  ): Promise<PaymentDocument> {
    const [doc] = await this.paymentModel.create(
      [
        {
          user: data.user,
          order: data.order,
          subtotal: data.subtotal,
          deliveryFee: data.deliveryFee,
          amount: data.amount,
          provider: data.provider,
          currency: data.currency.toUpperCase(),
          status: data.status ?? PaymentStatus.PENDING,
          reservation: data.reservation,
          images: [],
        },
      ],
      { session },
    );
    return doc;
  }

  async setReservation(
    id: Types.ObjectId | string,
    reservationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.paymentModel
      .findByIdAndUpdate(
        id,
        { $set: { reservation: reservationId } },
        { session },
      )
      .exec();
  }

  async markPaidManual(
    id: Types.ObjectId | string,
    data: {
      images: string[];
      note?: string;
      paidBy: Types.ObjectId | string;
    },
  ): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findOneAndUpdate(
        { _id: id, status: PaymentStatus.PENDING },
        {
          $set: {
            status: PaymentStatus.PAID,
            images: data.images,
            note: data.note,
            paidBy: data.paidBy,
            paidAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async findPendingForUser(
    userId: Types.ObjectId | string,
  ): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findOne({ user: userId, status: PaymentStatus.PENDING })
      .populate(PaymentRepository.populate)
      .exec();
  }

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    const features = new ApiFeatures<PaymentDocument>(
      this.paymentModel.find().populate(PaymentRepository.populate),
      queryParams,
      this.paymentModel,
    );

    return features.filter().search([...PAYMENT_SEARCH_FIELDS]).sort().paginate().executePaginated();
  }

  async findPaymentById(
    id: Types.ObjectId | string,
  ): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findById(id)
      .populate(PaymentRepository.populate)
      .exec();
  }

  async findByReference(reference: string): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findOne({ providerReference: reference })
      .populate(PaymentRepository.populate)
      .exec();
  }

  async setReference(
    id: Types.ObjectId | string,
    reference: string,
  ): Promise<void> {
    await this.paymentModel
      .findByIdAndUpdate(id, { providerReference: reference })
      .exec();
  }

  async updateStatus(
    id: Types.ObjectId | string,
    status: PaymentStatus,
    rawPayload?: Record<string, unknown>,
  ): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findByIdAndUpdate(
        id,
        {
          status,
          rawPayload,
          ...(status === PaymentStatus.PAID ? { paidAt: new Date() } : {}),
        },
        { new: true },
      )
      .populate(PaymentRepository.populate)
      .exec();
  }

  async markRefunded(
    id: Types.ObjectId | string,
    data: {
      refundedBy: Types.ObjectId | string;
      reason?: string;
      refundReference?: string;
    },
  ): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findOneAndUpdate(
        { _id: id, status: PaymentStatus.PAID },
        {
          $set: {
            status: PaymentStatus.REFUNDED,
            refundedAt: new Date(),
            refundedBy: data.refundedBy,
            refundReason: data.reason,
            refundReference: data.refundReference,
          },
        },
        { new: true },
      )
      .populate(PaymentRepository.populate)
      .exec();
  }

  /**
   * PENDING payments due for another provider status poll — either never
   * checked yet, or their backoff window elapsed.
   *
   * `provider: { $ne: MANUAL }` is a coarse filter, not "only Stripe" —
   * Manual is the only provider that structurally can never be polled (no
   * external session to check). Any other provider (Stripe today, more
   * later) is a candidate here; PaymentReconciliationService does the final
   * check (`strategy.getStatus` exists) so adding a new provider that
   * implements getStatus() gets swept automatically, no repo change needed.
   */
  async findDueForReconciliation(now: Date): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({
        status: PaymentStatus.PENDING,
        provider: { $ne: PaymentProvider.MANUAL },
        providerReference: { $exists: true, $ne: null },
        $or: [
          { nextReconciliationAt: null },
          { nextReconciliationAt: { $lte: now } },
        ],
      })
      .exec();
  }

  async bumpReconciliation(
    id: Types.ObjectId | string,
    nextReconciliationAt: Date,
    attempts: number,
  ): Promise<void> {
    await this.paymentModel
      .findByIdAndUpdate(id, {
        $set: { nextReconciliationAt, reconciliationAttempts: attempts },
      })
      .exec();
  }
}
