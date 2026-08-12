import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CartService } from '../cart/cart.service';
import { CartDocument } from '../cart/schemas/cart.schema';
import { InventoryDirection } from '../inventory/enums/inventory-direction.enum';
import { InventoryMovementType } from '../inventory/enums/inventory-movement-type.enum';
import { InventoryReferenceType } from '../inventory/enums/inventory-reference-type.enum';
import { ReservationSource } from '../inventory/enums/reservation.enums';
import { InventoryService } from '../inventory/inventory.service';
import { ReservationsService } from '../inventory/reservations.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailTemplateId } from '../notifications/templates/email-template-id.enum';
import { OrderSource } from '../orders/enums/order.enums';
import { OrdersService } from '../orders/orders.service';
import { ProductVariantsService } from '../products/product-variants.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductVariantDocument } from '../products/schemas/product-variant.schema';
import { resolveVariantUnitPrice } from '../products/utils/pricing.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { MarkPaymentPaidDto } from './dto/mark-payment-paid.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentProvider } from './enums/payment-provider.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import {
  CheckoutLineItem,
  CreateCheckoutParams,
} from './interfaces/payment-types.interface';
import { WebhookHeaders } from './interfaces/payment-strategy.interface';
import { OrderItem } from '../orders/schemas/order-item.schema';
import { OrderDocument } from '../orders/schemas/order.schema';
import { PaymentRepository } from './repository/payment.repository';
import { PaymentDocument } from './schemas/payment.schema';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';

export interface CheckoutResponse {
  paymentId: string;
  orderId: string;
  reservationId: string;
  redirectUrl: string;
  subtotal: number;
  deliveryFee: number;
  amount: number;
  currency: string;
  expiresAt: Date;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly strategyRegistry: PaymentStrategyRegistry,
    private readonly configService: ConfigService,
    private readonly cartService: CartService,
    private readonly notificationService: NotificationService,
    private readonly variantsService: ProductVariantsService,
    private readonly reservationsService: ReservationsService,
    private readonly inventoryService: InventoryService,
    private readonly ordersService: OrdersService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Self-serve checkout orchestration (after commit → provider redirect):
   * 1) assert available stock
   * 2) TX: order + payment + reservation (S1 allocate + reservedQuantity)
   * 3) Stripe session outside the TX
   */
  async createCheckout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutResponse> {
    const cart = await this.cartService.getCartDocument(userId);
    if (!cart.items.length) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'payment.cartEmpty');
    }

    const pendingCheckout =
      await this.paymentRepository.findPendingForUser(userId);
    if (pendingCheckout) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'payment.checkoutPending',
        { id: pendingCheckout._id.toString() },
      );
    }

    const pendingOrder = await this.ordersService.findPendingByUser(userId);
    if (pendingOrder) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'payment.checkoutPending',
        { id: pendingOrder._id.toString() },
      );
    }

    const { lineItems, orderItems, subtotal, reserveItems } =
      await this.buildCartCheckout(cart);

    await this.reservationsService.assertAvailable(reserveItems);

    const deliveryFee = this.getDeliveryFee();
    const amount = subtotal + deliveryFee;
    const currency =
      dto.currency?.toUpperCase() ??
      this.configService.get<string>('payment.defaultCurrency') ??
      'EUR';

    const session = await this.connection.startSession();
    let payment!: PaymentDocument;
    let orderId!: string;
    let reservationId!: string;
    let expiresAt!: Date;

    try {
      await session.withTransaction(async () => {
        const order = await this.ordersService.createPending({
          userId,
          createdBy: userId,
          source: OrderSource.CHECKOUT,
          items: orderItems,
          subtotal,
          deliveryFee,
          amount,
          currency,
          session,
        });

        payment = await this.paymentRepository.create(
          {
            user: userId,
            order: order._id,
            subtotal,
            deliveryFee,
            amount,
            provider: dto.provider,
            currency,
          },
          session,
        );

        const reservation = await this.reservationsService.createReservation({
          userId,
          createdBy: userId,
          source: ReservationSource.CHECKOUT,
          orderId: order._id,
          paymentId: payment._id,
          items: reserveItems,
          session,
        });

        await this.ordersService.linkPaymentAndReservation(
          order._id,
          payment._id,
          reservation._id,
          session,
        );
        await this.paymentRepository.setReservation(
          payment._id,
          reservation._id,
          session,
        );

        orderId = order._id.toString();
        reservationId = reservation._id.toString();
        expiresAt = reservation.expiresAt;
      });
    } finally {
      await session.endSession();
    }

    const strategy = this.strategyRegistry.get(dto.provider);
    const paymentId = payment._id.toString();

    const { redirectUrl, reference } = await strategy.createCheckout({
      paymentId,
      userId,
      amount,
      subtotal,
      deliveryFee,
      currency,
      lineItems,
      successUrl: this.buildUrl('payment.successUrl', paymentId),
      cancelUrl: this.buildUrl('payment.cancelUrl', paymentId),
      callbackUrl: this.buildCallbackUrl(dto.provider),
    });

    if (reference) {
      await this.paymentRepository.setReference(paymentId, reference);
    }

    return {
      paymentId,
      orderId,
      reservationId,
      redirectUrl,
      subtotal,
      deliveryFee,
      amount,
      currency,
      expiresAt,
    };
  }

  async resumeCheckout(userId: string): Promise<CheckoutResponse> {
    const payment = await this.paymentRepository.findPendingForUser(userId);
    if (!payment) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'payment.noPendingCheckout',
      );
    }
    if (!payment.reservation) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.checkoutIncomplete',
      );
    }

    if (payment.provider === PaymentProvider.MANUAL) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.manualProviderNotAllowed',
      );
    }

    const reservation = await this.reservationsService.findByOrderId(
      payment.order,
    );
    if (reservation.expiresAt.getTime() < Date.now()) {
      await this.cancelPendingCheckout(userId);
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'reservation.expired',
      );
    }

    const params = await this.buildCheckoutParamsFromPayment(payment);
    const strategy = this.strategyRegistry.get(payment.provider);

    const { redirectUrl, reference } = payment.providerReference
      ? await strategy.resumeCheckout(payment.providerReference, params)
      : await strategy.createCheckout(params);

    if (reference && reference !== payment.providerReference) {
      await this.paymentRepository.setReference(payment._id, reference);
    }

    return {
      paymentId: payment._id.toString(),
      orderId: this.getOrderId(payment),
      reservationId: payment.reservation.toString(),
      redirectUrl,
      subtotal: payment.subtotal,
      deliveryFee: payment.deliveryFee,
      amount: payment.amount,
      currency: payment.currency,
      expiresAt: reservation.expiresAt,
    };
  }

  async cancelPendingCheckout(userId: string): Promise<void> {
    const payment = await this.paymentRepository.findPendingForUser(userId);
    if (!payment) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'payment.noPendingCheckout',
      );
    }

    if (payment.order) {
      await this.reservationsService.releaseByOrderId(payment.order);
      await this.ordersService.markCancelled(payment.order);
    }

    await this.paymentRepository.updateStatus(
      payment._id,
      PaymentStatus.CANCELLED,
    );
  }

  async handleWebhook(
    provider: PaymentProvider,
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<void> {
    const strategy = this.strategyRegistry.get(provider);
    const event = await strategy.verifyWebhook(rawBody, headers);

    const payment = event.paymentId
      ? await this.paymentRepository.findPaymentById(event.paymentId)
      : event.reference
        ? await this.paymentRepository.findByReference(event.reference)
        : null;

    if (!payment) {
      this.logger.warn(
        `Webhook for ${provider} did not match any payment (ref=${event.reference})`,
      );
      return;
    }

    await this.applyStatusTransition(
      payment,
      event.status,
      event.raw as Record<string, unknown>,
    );
  }

  /**
   * Single place that turns "a provider says this payment is now X" into
   * DB writes + fulfillment. Called from the webhook handler (push) and
   * from PaymentReconciliationService (pull/poll) so both paths can never
   * disagree on what a status transition means.
   */
  async applyStatusTransition(
    payment: PaymentDocument, // current payment document
    status: PaymentStatus, // new status come from the provider
    raw?: Record<string, unknown>,
  ): Promise<void> {
    if (payment.status !== PaymentStatus.PENDING) {
      // A late "paid" signal on a payment we already gave up on (expired/
      // cancelled) means the provider actually captured money we can no
      // longer safely auto-fulfill (stock may already be released/resold).
      // Never drop that silently — surface it for manual admin follow-up
      // (fulfill if stock allows, refund otherwise).
      if (status === PaymentStatus.PAID) {
        this.logger.error(
          `Payment ${payment._id.toString()} (${payment.provider}) reported PAID but is already ` +
            `'${payment.status}' locally — likely captured right as its reservation expired. ` +
            `Needs manual review (fulfill if stock allows, refund otherwise).`,
        );
      }
      return;
    }
    if (status === PaymentStatus.PENDING) return;

    const updated = await this.paymentRepository.updateStatus(
      payment._id,
      status,
      raw,
    );
    if (!updated) return;

    if (status === PaymentStatus.PAID) {
      await this.fulfillOrder(updated, InventoryReferenceType.WEBHOOK);
    }
  }

  /**
   * Admin refund of a PAID payment (Stripe or Manual only — see docs).
   * Restocks the exact reservation lines sold at checkout so the reversal
   * lands back in the same warehouse(s) the sale came out of.
   */
  async refund(
    paymentId: Types.ObjectId,
    dto: RefundPaymentDto,
    adminId: string,
  ): Promise<PaymentDocument> {
    const payment = await this.findPaymentById(paymentId);
    if (payment.status !== PaymentStatus.PAID) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.cannotRefund',
      );
    }

    let refundReference: string | undefined;
    if (payment.provider === PaymentProvider.STRIPE) {
      const strategy = this.strategyRegistry.get(payment.provider);
      if (!strategy.refund || !payment.providerReference) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.refundNotSupported',
        );
      }
      const result = await strategy.refund(
        payment.providerReference,
        payment.amount,
      );
      refundReference = result.refundReference;
      //---------------------------------------------------------------------------------
      // other PaymentProvider and any future provider without a wired-up refund flow.
      //---------------------------------------------------------------------------------
    } else if (payment.provider !== PaymentProvider.MANUAL) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.refundNotSupported',
      );
    }

    const orderId = this.getOrderId(payment);
    const reservation = await this.reservationsService.findByOrderId(orderId);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        for (const line of reservation.lines) {
          await this.inventoryService.postMovement({
            variantId: line.variant,
            warehouseId: line.warehouse,
            type: InventoryMovementType.RETURN,
            quantity: line.quantity,
            direction: InventoryDirection.IN,
            referenceType: InventoryReferenceType.REFUND,
            referenceId: orderId,
            reason: dto.reason,
            createdBy: adminId,
            session,
          });
        }
        await this.ordersService.markRefunded(orderId, session);
      });
    } finally {
      await session.endSession();
    }

    const updated = await this.paymentRepository.markRefunded(paymentId, {
      refundedBy: adminId,
      reason: dto.reason,
      refundReference,
    });
    return updated!;
  }

  /**
   * Admin marks manual payment paid (proof: images[] + note).
   * Then confirms reservation → sales with referenceId = orderId.
   */
  async markPaid(
    paymentId: Types.ObjectId,
    dto: MarkPaymentPaidDto,
    adminId: string,
  ): Promise<PaymentDocument> {
    const payment = await this.findPaymentById(paymentId);
    if (payment.status !== PaymentStatus.PENDING) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'payment.notPending');
    }
    const updated = await this.paymentRepository.markPaidManual(paymentId, {
      images: dto.images ?? [],
      note: dto.note,
      paidBy: adminId,
    });
    if (!updated) {
      throw new I18nHttpException(HttpStatus.CONFLICT, 'payment.notPending');
    }

    await this.fulfillOrder(
      updated,
      InventoryReferenceType.MANUAL_ORDER,
      adminId,
    );
    return (await this.paymentRepository.findPaymentById(paymentId))!;
  }

  async getMyPayments(
    userId: Types.ObjectId | string,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentRepository.findAll({ ...queryParams, user: userId });
  }

  async findAllPayments(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentRepository.findAll(queryParams);
  }

  async findPaymentById(id: Types.ObjectId | string): Promise<PaymentDocument> {
    const payment = await this.paymentRepository.findPaymentById(id);
    if (!payment) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'payment.notFound', {
        id: id.toString(),
      });
    }
    return payment;
  }

  private async buildCartCheckout(cart: CartDocument): Promise<{
    lineItems: CheckoutLineItem[];
    orderItems: OrderItem[];
    reserveItems: Array<{
      variantId: string;
      productId: string;
      quantity: number;
    }>;
    subtotal: number;
  }> {
    // line items are the items that will be displayed to the user in the checkout page
    const lineItems: CheckoutLineItem[] = [];
    // order items are the items that will be added to the order
    const orderItems: OrderItem[] = [];
    const reserveItems: Array<{
      variantId: string;
      productId: string;
      quantity: number;
    }> = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const cartVariant = item.variant as unknown as ProductVariantDocument;
      const variantId = cartVariant._id?.toString?.() ?? String(cartVariant);

      const freshVariant =
        await this.variantsService.findAvailableById(variantId);
      const product = await this.productModel
        .findOne({ _id: freshVariant.product, deletedAt: null })
        .exec();

      if (!product) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'payment.productNotFound',
          { id: freshVariant.product.toString() },
        );
      }

      const availability =
        await this.reservationsService.getAvailability(variantId);
      if (item.quantity > availability.available) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.insufficientStock',
          {
            name: this.resolveProductName(product as ProductDocument),
            available: availability.available,
          },
        );
      }

      const unitPrice = resolveVariantUnitPrice(freshVariant);
      if (unitPrice <= 0) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.invalidAmount',
          { name: this.resolveProductName(product) },
        );
      }

      const totalPrice = unitPrice * item.quantity;
      const productName = this.resolveProductName(product);

      lineItems.push({
        productId: variantId, // string id of the variant
        name: productName,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      });

      orderItems.push({
        variant: freshVariant._id, // object id of the variant
        product: product._id,
        quantity: item.quantity,
        unitPrice,
        productName,
      });

      reserveItems.push({
        variantId,
        productId: product._id.toString(),
        quantity: item.quantity,
      });

      subtotal += totalPrice;
    }

    return { lineItems, orderItems, reserveItems, subtotal };
  }

  private async fulfillOrder(
    payment: PaymentDocument,
    referenceType:
      | InventoryReferenceType.WEBHOOK
      | InventoryReferenceType.MANUAL_ORDER,
    movementCreatedBy?: string,
  ): Promise<void> {
    const orderId = this.getOrderId(payment);

    await this.reservationsService.confirmByOrderId({
      orderId,
      referenceType,
      movementCreatedBy: movementCreatedBy ?? payment.user.toString(),
    });

    await this.ordersService.markPaid(orderId);
    await this.cartService.clearCart(payment.user.toString());
    await this.sendOrderConfirmation(payment);

    this.logger.log(
      `Payment ${payment._id.toString()} PAID — order ${orderId} fulfilled`,
    );
  }

  private async sendOrderConfirmation(payment: PaymentDocument): Promise<void> {
    const user = await this.userModel.findById(payment.user).exec();
    if (!user?.email) return;

    const order = await this.requireOrder(payment);
    const itemsList = order.items
      .map(
        (item) =>
          `- ${item.productName} x${item.quantity} = ${(item.unitPrice * item.quantity).toFixed(2)} ${payment.currency}`,
      )
      .join('\n');

    try {
      await this.notificationService.sendEmail(
        user.email,
        EmailTemplateId.ORDER_CONFIRMATION,
        {
          name: user.name,
          orderIdShort: order._id.toString().slice(-8),
          itemsList,
          subtotal: payment.subtotal.toFixed(2),
          deliveryFee: payment.deliveryFee.toFixed(2),
          total: payment.amount.toFixed(2),
          currency: payment.currency,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation to ${user.email}: ${error}`,
      );
    }
  }

  private getDeliveryFee(): number {
    const fee = this.configService.get<number>('payment.deliveryFee');
    return Number.isFinite(fee) && fee >= 0 ? fee : 70;
  }

  private resolveProductName(product: ProductDocument): string {
    return (
      getLocalizedValue(product.title, DEFAULT_CONTENT_LOCALE) ??
      getLocalizedValue(product.title, 'en') ??
      'Product'
    );
  }

  private async buildCheckoutParamsFromPayment(
    payment: PaymentDocument,
  ): Promise<CreateCheckoutParams> {
    const paymentId = payment._id.toString();
    const order = await this.requireOrder(payment);
    const lineItems: CheckoutLineItem[] = order.items.map((item) => ({
      productId: item.variant.toString(),
      name: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.unitPrice * item.quantity,
    }));

    return {
      paymentId,
      userId: payment.user.toString(),
      amount: payment.amount,
      subtotal: payment.subtotal,
      deliveryFee: payment.deliveryFee,
      currency: payment.currency,
      lineItems,
      successUrl: this.buildUrl('payment.successUrl', paymentId),
      cancelUrl: this.buildUrl('payment.cancelUrl', paymentId),
      callbackUrl: this.buildCallbackUrl(payment.provider),
    };
  }

  private getOrderId(payment: PaymentDocument): string {
    const order = payment.order as Types.ObjectId | OrderDocument;
    if (order && typeof order === 'object' && '_id' in order) {
      return order._id.toString();
    }
    return String(payment.order);
  }

  private async requireOrder(payment: PaymentDocument): Promise<OrderDocument> {
    /**
     * payment.order already looks like an Order?  (object + has "items")
       → use it as-is (skip DB)
      else
       → load via ordersService.findOne(payment.order)
     */
    const populated = payment.order as Types.ObjectId | OrderDocument;
    if (populated && typeof populated === 'object' && 'items' in populated) {
      return populated as OrderDocument;
    }
    const order = await this.ordersService.findOne(
      new Types.ObjectId(String(payment.order)),
    );
    return order;
  }

  private buildUrl(configKey: string, paymentId: string): string {
    const base = this.configService.get<string>(configKey) ?? '';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}paymentId=${paymentId}`;
  }

  private buildCallbackUrl(provider: PaymentProvider): string {
    const base =
      this.configService.get<string>('payment.callbackBaseUrl') ?? '';
    return `${base}/payments/webhook/${provider}`;
  }
}
