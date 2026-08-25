import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PopulateOptions, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { ContentLocale } from '../../../common/constants/supported-content-locales.constant';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { resolveLocalizedTitle } from '../../products/utils/product-populate.util';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { WAREHOUSE_PUBLIC_FIELDS } from '../../warehouses/constants/warehouse.constants';
import { ReservationSource, ReservationStatus } from '../enums/reservation.enums';
import {
  InventoryReservation,
  InventoryReservationDocument,
} from '../schemas/inventory-reservation.schema';
import { ReservationLine } from '../schemas/reservation-line.schema';

/**
 * Read/list populate only. Confirm/release keep raw ObjectIds on lines
 * (variant/warehouse) — passing populated docs into `$inc` queries is unsafe.
 *
 * Never select user.password. Product title is i18n — resolve in transform
 * because LocalizationInterceptor does not walk populated sub-docs.
 */
const RESERVATION_POPULATE: PopulateOptions[] = [
  { path: 'user', select: USER_PUBLIC_FIELDS },
  { path: 'createdBy', select: USER_PUBLIC_FIELDS },
  {
    path: 'order',
    select:
      'status source amount currency',
  },
  { path: 'lines.variant', select: 'sku barcode' },
  {
    path: 'lines.product',
    select: 'title slug',
    transform: (
      doc: {
        _id: Types.ObjectId;
        title?: Partial<Record<ContentLocale, string>> | string;
        slug?: string;
      } | null,
    ) =>
      doc && {
        _id: doc._id,
        title: resolveLocalizedTitle(doc),
        slug: doc.slug ?? null,
      },
  },
  { path: 'lines.warehouse', select: WAREHOUSE_PUBLIC_FIELDS },
];

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
    const [doc] = await this.reservationModel.create([{ ...params }], {
      session,
    });
    return doc;
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel.findById(id).exec();
  }

  /** Admin list/detail — populated. Do not use on confirm/release. */
  async findByIdForDisplay(
    id: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel
      .findById(id)
      .populate(RESERVATION_POPULATE)
      .exec();
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryReservationDocument>> {
    const { status, userId, source, orderId, ...rest } = queryParams;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (userId) filter.user = userId;
    if (orderId) filter.order = orderId;

    const features = new ApiFeatures<InventoryReservationDocument>(
      this.reservationModel
        .find<InventoryReservationDocument>(filter)
        .populate(RESERVATION_POPULATE),
      rest,
      this.reservationModel,
    )
      .filter()
      .sort()
      .paginate();

    return features.executePaginated();
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

  async findByOrderIdForDisplay(
    orderId: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel
      .findOne({ order: orderId })
      .populate(RESERVATION_POPULATE)
      .exec();
  }

  async findByPaymentId(
    paymentId: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument | null> {
    return this.reservationModel.findOne({ payment: paymentId }).exec();
  }

  /** Pending reservations whose TTL has already elapsed — swept by PaymentReconciliationService. */
  async findExpiredPending(
    now: Date,
  ): Promise<InventoryReservationDocument[]> {
    return this.reservationModel
      .find({ status: ReservationStatus.PENDING, expiresAt: { $lt: now } })
      .exec();
  }

  /**
   * Push a reservation's TTL forward. Used only for the "rescued right at
   * expiry" case — the payment turned out to already be paid at the
   * provider, so we buy a few minutes for the normal confirm path to run
   * without also tripping its own expiry check.
   */
  async extendExpiry(
    id: Types.ObjectId | string,
    newExpiresAt: Date,
  ): Promise<void> {
    await this.reservationModel
      .findByIdAndUpdate(id, { $set: { expiresAt: newExpiresAt } })
      .exec();
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
