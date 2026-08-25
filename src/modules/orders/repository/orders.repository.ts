import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PopulateOptions, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { ORDER_SEARCH_FIELDS } from '../constants/order.constants';
import { OrderStatus } from '../enums/order.enums';
import { Order, OrderDocument } from '../schemas/order.schema';

/**
 * HTTP list/detail only. Checkout and payment fulfillment keep raw ObjectIds
 * on `items.variant` — those paths pass the id into inventory queries.
 */
const ORDER_POPULATE: PopulateOptions[] = [
  { path: 'user', select: USER_PUBLIC_FIELDS },
  { path: 'createdBy', select: USER_PUBLIC_FIELDS },
  { path: 'items.variant', select: 'sku barcode options' },
  { path: 'payment', select: 'status amount notes' },
];

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(
    data: Partial<Order>,
    session?: ClientSession,
  ): Promise<OrderDocument> {
    const [doc] = await this.orderModel.create([data], { session });
    return doc;
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<OrderDocument | null> {
    return this.orderModel.findById(id).exec();
  }

  async findByIdForDisplay(
    id: Types.ObjectId | string,
  ): Promise<OrderDocument | null> {
    return this.orderModel.findById(id).populate(ORDER_POPULATE).exec();
  }

  async findPendingByUser(
    userId: Types.ObjectId | string,
  ): Promise<OrderDocument | null> {
    return this.orderModel
      .findOne({ user: userId, status: OrderStatus.PENDING_PAYMENT })
      .exec();
  }

  async findByUser(
    userId: Types.ObjectId | string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    const features = new ApiFeatures<OrderDocument>(
      this.orderModel.find({ user: userId }).populate(ORDER_POPULATE),
      queryParams,
      this.orderModel,
    );
    return features
      .filter()
      .search([...ORDER_SEARCH_FIELDS])
      .sort()
      .paginate()
      .executePaginated();
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    const features = new ApiFeatures<OrderDocument>(
      this.orderModel.find().populate(ORDER_POPULATE),
      queryParams,
      this.orderModel,
    );
    return features
      .filter()
      .search([...ORDER_SEARCH_FIELDS])
      .sort()
      .paginate()
      .executePaginated();
  }

  async updateLinks(
    id: Types.ObjectId | string,
    links: { payment?: Types.ObjectId; reservation?: Types.ObjectId },
    session?: ClientSession,
  ): Promise<void> {
    await this.orderModel
      .findByIdAndUpdate(id, { $set: links }, { session })
      .exec();
  }

  async updateStatus(
    id: Types.ObjectId | string,
    status: OrderStatus,
    session?: ClientSession,
  ): Promise<OrderDocument | null> {
    return this.orderModel
      .findByIdAndUpdate(id, { $set: { status } }, { new: true, session })
      .exec();
  }
}
