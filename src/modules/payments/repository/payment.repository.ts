import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { Payment, PaymentDocument } from '../schemas/payment.schema';

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

    return features.filter().sort().paginate().executePaginated();
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
}
