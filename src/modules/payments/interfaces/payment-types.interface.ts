import { PaymentStatus } from '../enums/payment-status.enum';

export interface CheckoutLineItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CreateCheckoutParams {
  paymentId: string;
  userId: string;
  amount: number;
  subtotal: number;
  deliveryFee: number;
  currency: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}

export interface CheckoutResult {
  redirectUrl: string;
  reference: string;
}

export interface NormalizedWebhookEvent {
  reference?: string;
  paymentId?: string;
  status: PaymentStatus;
  raw: unknown;
}
