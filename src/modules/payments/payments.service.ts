import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CartService } from '../cart/cart.service';
import { CartDocument } from '../cart/schemas/cart.schema';
import { NotificationService } from '../notifications/notification.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductStatus } from '../products/enums/product-status.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentProvider } from './enums/payment-provider.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { CheckoutLineItem } from './interfaces/payment-types.interface';
import { WebhookHeaders } from './interfaces/payment-strategy.interface';
import { PaymentRepository } from './repository/payment.repository';
import { PaymentItem } from './schemas/payment-item.schema';
import { PaymentDocument } from './schemas/payment.schema';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';

export interface CheckoutResponse {
  paymentId: string;
  redirectUrl: string;
  subtotal: number;
  deliveryFee: number;
  amount: number;
  currency: string;
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
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createCheckout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutResponse> {
    const cart = await this.cartService.getCart(userId);
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

    const { lineItems, paymentItems, subtotal } =
      await this.buildCartCheckout(cart);

    const deliveryFee = this.getDeliveryFee();
    const amount = subtotal + deliveryFee;
    const currency =
      dto.currency?.toUpperCase() ??
      this.configService.get<string>('payment.defaultCurrency') ??
      'EUR';

    const payment = await this.paymentRepository.create({
      user: userId,
      items: paymentItems,
      subtotal,
      deliveryFee,
      amount,
      provider: dto.provider,
      currency,
    });

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
      redirectUrl,
      subtotal,
      deliveryFee,
      amount,
      currency,
    };
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

    if (payment.status === PaymentStatus.PAID) return;

    const updated = await this.paymentRepository.updateStatus(
      payment._id,
      event.status,
      event.raw as Record<string, unknown>,
    );

    if (event.status === PaymentStatus.PAID && updated) {
      await this.fulfillOrder(updated);
    }
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
    paymentItems: PaymentItem[];
    subtotal: number;
  }> {
    const lineItems: CheckoutLineItem[] = [];
    const paymentItems: PaymentItem[] = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const product = item.product as unknown as ProductDocument;
      const productId = product._id.toString();

      const freshProduct = await this.productModel.findById(productId).exec();
      if (!freshProduct) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'payment.productNotFound',
          { id: productId },
        );
      }

      if (
        freshProduct.status === ProductStatus.INACTIVE ||
        freshProduct.status === ProductStatus.OUT_OF_STOCK
      ) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.productUnavailable',
          { name: this.resolveProductName(freshProduct) },
        );
      }

      if (freshProduct.stock < item.quantity) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.insufficientStock',
          {
            name: this.resolveProductName(freshProduct),
            available: freshProduct.stock,
          },
        );
      }

      const unitPrice = this.resolveUnitPrice(freshProduct);
      if (unitPrice <= 0) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'payment.invalidAmount',
          { name: this.resolveProductName(freshProduct) },
        );
      }

      const totalPrice = unitPrice * item.quantity;
      const productName = this.resolveProductName(freshProduct);

      lineItems.push({
        productId,
        name: productName,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      });

      paymentItems.push({
        product: freshProduct._id,
        quantity: item.quantity,
        unitPrice,
        productName,
      });

      subtotal += totalPrice;
    }

    return { lineItems, paymentItems, subtotal };
  }

  private async fulfillOrder(payment: PaymentDocument): Promise<void> {
    for (const item of payment.items) {
      const product = await this.productModel.findById(item.product).exec();
      if (!product) continue;

      const newStock = Math.max(0, product.stock - item.quantity);
      await this.productModel.findByIdAndUpdate(item.product, {
        stock: newStock,
        ...(newStock === 0 ? { status: ProductStatus.OUT_OF_STOCK } : {}),
      });
    }

    await this.cartService.clearCart(payment.user.toString());
    await this.sendOrderConfirmation(payment);

    this.logger.log(
      `Payment ${payment._id.toString()} PAID — order fulfilled for user ${payment.user.toString()}`,
    );
  }

  private async sendOrderConfirmation(payment: PaymentDocument): Promise<void> {
    const user = await this.userModel.findById(payment.user).exec();
    if (!user?.email) return;

    const itemsList = payment.items
      .map(
        (item) =>
          `- ${item.productName} x${item.quantity} = ${(item.unitPrice * item.quantity).toFixed(2)} ${payment.currency}`,
      )
      .join('\n');

    const subject = `Order confirmation #${payment._id.toString().slice(-8)}`;
    const message = `Hi ${user.name},

Thank you for your purchase!

Order summary:
${itemsList}

Subtotal: ${payment.subtotal.toFixed(2)} ${payment.currency}
Delivery: ${payment.deliveryFee.toFixed(2)} ${payment.currency}
Total: ${payment.amount.toFixed(2)} ${payment.currency}

We will process your order shortly.`;

    try {
      await this.notificationService.sendEmail(user.email, subject, message);
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

  private resolveUnitPrice(product: ProductDocument): number {
    return product.priceAfterDiscount && product.priceAfterDiscount > 0
      ? product.priceAfterDiscount
      : product.price;
  }

  private resolveProductName(product: ProductDocument): string {
    const title = product.title as unknown as
      | { en?: string; de?: string }
      | string;
    if (typeof title === 'string') return title;
    return title?.de ?? title?.en ?? 'Product';
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
