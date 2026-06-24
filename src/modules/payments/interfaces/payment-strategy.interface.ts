import { PaymentProvider } from '../enums/payment-provider.enum';
import {
  CheckoutResult,
  CreateCheckoutParams,
  NormalizedWebhookEvent,
} from './payment-types.interface';

export type WebhookHeaders = Record<string, string | string[] | undefined>;
/**
 * Contract every payment provider (Stripe, Klarna, ...) must implement.
 * The {@link PaymentsService} depends only on this interface, never on a
 * concrete SDK, so new providers are added by dropping in a new strategy.
 */
export interface IPaymentStrategy {
  readonly provider: PaymentProvider;

  /** Create a hosted checkout / invoice and return the redirect URL. */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;

  /**
   * Validate an incoming webhook (signature / hash) and normalize it.
   * MUST throw if the payload cannot be verified.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<NormalizedWebhookEvent> | NormalizedWebhookEvent;
}
