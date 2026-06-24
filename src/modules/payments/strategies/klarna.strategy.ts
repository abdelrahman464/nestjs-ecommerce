import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nHttpException } from '../../../common/filters/i18n-http.exception';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import {
  IPaymentStrategy,
  WebhookHeaders,
} from '../interfaces/payment-strategy.interface';
import {
  CheckoutResult,
  CreateCheckoutParams,
  NormalizedWebhookEvent,
} from '../interfaces/payment-types.interface';

interface KlarnaCheckoutOrder {
  order_id: string;
  status?: string;
}

@Injectable()
export class KlarnaStrategy implements IPaymentStrategy {
  readonly provider = PaymentProvider.KLARNA;
  private readonly logger = new Logger(KlarnaStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const apiUrl = this.configService.get<string>('klarna.apiUrl') ?? '';
    const checkoutUrl =
      this.configService.get<string>('klarna.checkoutUrl') ?? '';
    const purchaseCountry =
      this.configService.get<string>('klarna.purchaseCountry') ?? 'DE';
    const locale = this.configService.get<string>('klarna.locale') ?? 'de-DE';
    const amountMinor = Math.round(params.amount * 100);

    const orderLines = [
      ...params.lineItems.map((item) => ({
        type: 'physical',
        reference: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit_price: Math.round(item.unitPrice * 100),
        tax_rate: 0,
        total_amount: Math.round(item.totalPrice * 100),
        total_tax_amount: 0,
      })),
      {
        type: 'shipping_fee',
        reference: 'delivery',
        name: 'Delivery',
        quantity: 1,
        unit_price: Math.round(params.deliveryFee * 100),
        tax_rate: 0,
        total_amount: Math.round(params.deliveryFee * 100),
        total_tax_amount: 0,
      },
    ];

    const response = await fetch(`${apiUrl}/checkout/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.buildAuthHeader(),
      },
      body: JSON.stringify({
        purchase_country: purchaseCountry,
        purchase_currency: params.currency.toUpperCase(),
        locale,
        order_amount: amountMinor,
        order_tax_amount: 0,
        order_lines: orderLines,
        merchant_urls: {
          terms: params.successUrl,
          checkout: params.cancelUrl,
          confirmation: params.successUrl,
          push: params.callbackUrl,
        },
        merchant_reference1: params.paymentId,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Klarna checkout failed: ${response.status} ${body}`);
      throw new I18nHttpException(
        HttpStatus.BAD_GATEWAY,
        'payment.checkoutFailed',
      );
    }

    const order = (await response.json()) as KlarnaCheckoutOrder;
    const redirectUrl = `${checkoutUrl}/checkout/v3/orders/${order.order_id}/redirect`;

    return { redirectUrl, reference: order.order_id };
  }

  verifyWebhook(
    rawBody: Buffer,
    _headers: WebhookHeaders,
  ): NormalizedWebhookEvent {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.invalidWebhook',
      );
    }

    const orderId =
      (payload.order_id as string | undefined) ??
      (payload.orderId as string | undefined);
    const paymentId = payload.merchant_reference1 as string | undefined;
    const status = this.mapStatus(String(payload.status ?? ''));

    return {
      reference: orderId,
      paymentId,
      status,
      raw: payload,
    };
  }

  private mapStatus(status: string): PaymentStatus {
    const normalized = status.toLowerCase();
    if (normalized === 'checkout_complete' || normalized === 'authorized') {
      return PaymentStatus.PAID;
    }
    if (normalized === 'cancelled' || normalized === 'canceled') {
      return PaymentStatus.CANCELLED;
    }
    if (normalized === 'expired') {
      return PaymentStatus.EXPIRED;
    }
    if (normalized === 'failed') {
      return PaymentStatus.FAILED;
    }
    return PaymentStatus.PENDING;
  }

  private buildAuthHeader(): string {
    const username = this.configService.get<string>('klarna.username') ?? '';
    const password = this.configService.get<string>('klarna.password') ?? '';
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
}
