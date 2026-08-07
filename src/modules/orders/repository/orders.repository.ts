import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { OrderStatus } from '../enums/order.enums';
import { Order, OrderDocument } from '../schemas/order.schema';

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
      this.orderModel.find({ user: userId }),
      queryParams,
      this.orderModel,
    );
    return features.filter().sort().paginate().executePaginated();
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    const features = new ApiFeatures<OrderDocument>(
      this.orderModel.find(),
      queryParams,
      this.orderModel,
    );
    return features.filter().sort().paginate().executePaginated();
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
