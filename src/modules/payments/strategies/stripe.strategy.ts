import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Stripe = require('stripe');
import { I18nHttpException } from '../../../common/filters/i18n-http.exception';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import {
  IPaymentStrategy,
  RefundResult,
  WebhookHeaders,
} from '../interfaces/payment-strategy.interface';
import {
  CheckoutResult,
  CreateCheckoutParams,
  NormalizedWebhookEvent,
} from '../interfaces/payment-types.interface';

@Injectable()
export class StripeStrategy implements IPaymentStrategy {
  readonly provider = PaymentProvider.STRIPE;
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(StripeStrategy.name)
    private readonly logger: PinoLogger,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    this.webhookSecret =
      this.configService.get<string>('stripe.webhookSecret') ?? '';
    this.stripe = new Stripe(secretKey ?? '');
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const currency = params.currency.toLowerCase();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      ...params.lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(item.unitPrice * 100),
          product_data: { name: item.name },
        },
      })),
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(params.deliveryFee * 100),
          product_data: {
            name:
              this.configService.get<string>('app.name') +
              ' - Delivery Fee',
          },
        },
      },
    ];

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.paymentId,
      metadata: {
        paymentId: params.paymentId,
        userId: params.userId,
      },
    });

    if (!session.url) {
      throw new I18nHttpException(
        HttpStatus.BAD_GATEWAY,
        'payment.checkoutFailed',
      );
    }

    return { redirectUrl: session.url, reference: session.id };
  }

  async resumeCheckout(
    reference: string,
    params: CreateCheckoutParams,
  ): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);

    if (session.status === 'open' && session.url) {
      return { redirectUrl: session.url, reference: session.id };
    }

    if (session.status === 'complete') {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'payment.checkoutAlreadyPaid',
      );
    }

    return this.createCheckout(params);
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): NormalizedWebhookEvent {
    const signature = headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.invalidWebhook',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Stripe webhook signature verification failed',
      );
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.invalidWebhook',
      );
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId =
      session.metadata?.paymentId ?? session.client_reference_id;

    return {
      reference: session.id,
      paymentId: paymentId ?? undefined,
      status: this.mapStatus(event.type),
      raw: event as unknown,
    };
  }

  /**
   * Full refund of a completed checkout. Checkout Sessions can't be refunded
   * directly — refunds apply to the underlying PaymentIntent, so we resolve
   * that first.
   */
  async refund(reference: string, amount: number): Promise<RefundResult> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!paymentIntentId) {
      this.logger.error(
        { reference },
        'Cannot refund Stripe session — no payment_intent',
      );
      throw new I18nHttpException(HttpStatus.BAD_GATEWAY, 'payment.refundFailed');
    }

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100),
      });
      return { refundReference: refund.id };
    } catch (error) {
      this.logger.error(
        {
          reference,
          paymentIntentId,
          err: error instanceof Error ? error.message : String(error),
        },
        'Stripe refund failed',
      );
      throw new I18nHttpException(HttpStatus.BAD_GATEWAY, 'payment.refundFailed');
    }
  }

  /** Active poll used by the reconciliation sweep to catch missed webhooks. */
  async getStatus(reference: string): Promise<PaymentStatus> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);

    if (session.payment_status === 'paid') return PaymentStatus.PAID;
    if (session.status === 'expired') return PaymentStatus.EXPIRED;
    return PaymentStatus.PENDING;
  }

  private mapStatus(eventType: string): PaymentStatus {
    switch (eventType) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return PaymentStatus.PAID;
      case 'checkout.session.async_payment_failed':
        return PaymentStatus.FAILED;
      case 'checkout.session.expired':
        return PaymentStatus.EXPIRED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
