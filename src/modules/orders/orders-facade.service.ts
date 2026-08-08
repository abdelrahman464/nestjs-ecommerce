import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { ReservationSource } from '../inventory/enums/reservation.enums';
import { ReservationsService } from '../inventory/reservations.service';
import { PaymentProvider } from '../payments/enums/payment-provider.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import {
  Payment,
  PaymentDocument,
} from '../payments/schemas/payment.schema';
import { ProductVariantsService } from '../products/product-variants.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { resolveVariantUnitPrice } from '../products/utils/pricing.util';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { OrderSource } from './enums/order.enums';
import { OrdersService } from './orders.service';
import { OrderItem } from './schemas/order-item.schema';

@Injectable()
export class OrdersFacadeService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly reservationsService: ReservationsService,
    private readonly variantsService: ProductVariantsService,
    private readonly configService: ConfigService,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Admin creates order for a customer:
   * order (manual_order) + pending manual payment + reservation (longer TTL).
   * Mongo TX covers order + payment + reservedQuantity + reservation doc.
   */
  async createManualOrder(adminId: string, dto: CreateManualOrderDto) {
    const deliveryFee = this.getDeliveryFee();
    const currency =
      dto.currency?.toUpperCase() ??
      this.configService.get<string>('payment.defaultCurrency') ??
      'EUR';

    const built = await this.buildManualItems(dto);
    await this.reservationsService.assertAvailable(
      built.map((i) => ({
        variantId: i.variant,
        productId: i.product,
        quantity: i.quantity,
      })),
    );

    const subtotal = built.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0,
    );
    const amount = subtotal + deliveryFee;

    const session = await this.connection.startSession();
    try {
      let orderId!: string;
      let paymentId!: string;
      let reservationId!: string;
      let expiresAt!: Date;

      await session.withTransaction(async () => {
        const order = await this.ordersService.createPending({
          userId: dto.customerId,
          createdBy: adminId,
          source: OrderSource.MANUAL_ORDER,
          items: built,
          subtotal,
          deliveryFee,
          amount,
          currency,
          note: dto.note,
          session,
        });

        const [payment] = await this.paymentModel.create(
          [
            {
              user: new Types.ObjectId(dto.customerId),
              order: order._id,
              subtotal,
              deliveryFee,
              amount,
              provider: PaymentProvider.MANUAL,
              currency,
              status: PaymentStatus.PENDING,
              images: [],
            },
          ],
          { session },
        );

        const reservation = await this.reservationsService.createReservation({
          userId: dto.customerId,
          createdBy: adminId,
          source: ReservationSource.MANUAL_ORDER,
          orderId: order._id,
          paymentId: payment._id,
          items: built.map((i) => ({
            variantId: i.variant,
            productId: i.product,
            quantity: i.quantity,
          })),
          session,
        });

        await this.ordersService.linkPaymentAndReservation(
          order._id,
          payment._id,
          reservation._id,
          session,
        );

        await this.paymentModel
          .findByIdAndUpdate(
            payment._id,
            { $set: { reservation: reservation._id } },
            { session },
          )
          .exec();

        orderId = order._id.toString();
        paymentId = payment._id.toString();
        reservationId = reservation._id.toString();
        expiresAt = reservation.expiresAt;
      });

      return { orderId, paymentId, reservationId, expiresAt, amount, currency };
    } finally {
      await session.endSession();
    }
  }

  private async buildManualItems(
    dto: CreateManualOrderDto,
  ): Promise<OrderItem[]> {
    const items: OrderItem[] = [];
    for (const row of dto.items) {
      const variant = await this.variantsService.findAvailableById(
        row.variantId,
      );
      const product = await this.productModel
        .findOne({ _id: variant.product, deletedAt: null })
        .exec();
      if (!product) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'payment.productNotFound',
          { id: String(variant.product) },
        );
      }

      const productName =
        getLocalizedValue(product.title, DEFAULT_CONTENT_LOCALE) ?? 'Product';
      const unitPrice = resolveVariantUnitPrice(variant);

      items.push({
        variant: variant._id,
        product: product._id,
        quantity: row.quantity,
        unitPrice,
        productName,
      });
    }
    return items;
  }

  private getDeliveryFee(): number {
    const fee = this.configService.get<number>('payment.deliveryFee');
    return Number.isFinite(fee) && fee >= 0 ? fee : 70;
  }
}
