import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import {
  CheckoutResult,
  CreateCheckoutParams,
  NormalizedWebhookEvent,
} from './payment-types.interface';

export interface RefundResult {
  refundReference?: string;
}

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
   * Re-open an existing provider checkout session, or create a new one if expired.
   */
  resumeCheckout(
    reference: string,
    params: CreateCheckoutParams,
  ): Promise<CheckoutResult>;

  /**
   * Validate an incoming webhook (signature / hash) and normalize it.
   * MUST throw if the payload cannot be verified.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<NormalizedWebhookEvent> | NormalizedWebhookEvent;

  /**
   * Refund a completed payment at the provider. Optional — providers that
   * don't support (or haven't wired up) refunds simply omit this method;
   * PaymentsService.refund() checks for its presence before calling.
   */
  refund?(reference: string, amount: number): Promise<RefundResult>;

  /**
   * Actively poll the provider for a payment's current status. Optional —
   * used by PaymentReconciliationService to catch missed/delayed webhooks.
   */
  getStatus?(reference: string): Promise<PaymentStatus>;
}
