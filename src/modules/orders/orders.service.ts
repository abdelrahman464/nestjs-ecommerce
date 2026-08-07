import { HttpStatus, Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { OrderSource, OrderStatus } from './enums/order.enums';
import { OrdersRepository } from './repository/orders.repository';
import { OrderItem } from './schemas/order-item.schema';
import { OrderDocument } from './schemas/order.schema';

export type CreatePendingOrderParams = {
  userId: string;
  createdBy: string;
  source: OrderSource;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  amount: number;
  currency: string;
  note?: string;
  session?: ClientSession;
};

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async findOne(
    id: Types.ObjectId,
    requester?: { id: string; isStaff: boolean },
  ): Promise<OrderDocument> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'order.notFound', {
        id: id.toString(),
      });
    }
    if (
      requester &&
      !requester.isStaff &&
      order.user.toString() !== requester.id
    ) {
      throw new I18nHttpException(HttpStatus.FORBIDDEN, 'order.forbidden');
    }
    return order;
  }

  async findMine(
    userId: string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    return this.ordersRepository.findByUser(userId, queryParams);
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    return this.ordersRepository.findAll(queryParams);
  }

  async findPendingByUser(userId: string): Promise<OrderDocument | null> {
    return this.ordersRepository.findPendingByUser(userId);
  }

  async createPending(
    params: CreatePendingOrderParams,
  ): Promise<OrderDocument> {
    return this.ordersRepository.create(
      {
        user: new Types.ObjectId(params.userId),
        createdBy: new Types.ObjectId(params.createdBy),
        source: params.source,
        status: OrderStatus.PENDING_PAYMENT,
        items: params.items,
        subtotal: params.subtotal,
        deliveryFee: params.deliveryFee,
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        note: params.note,
      },
      params.session,
    );
  }

  async linkPaymentAndReservation(
    orderId: Types.ObjectId | string,
    paymentId: Types.ObjectId,
    reservationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.ordersRepository.updateLinks(
      orderId,
      { payment: paymentId, reservation: reservationId },
      session,
    );
  }

  async markPaid(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.ordersRepository.updateStatus(
      orderId,
      OrderStatus.PAID,
      session,
    );
  }

  async markCancelled(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.ordersRepository.updateStatus(
      orderId,
      OrderStatus.CANCELLED,
      session,
    );
  }
}
