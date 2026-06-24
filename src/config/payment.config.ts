import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  successUrl:
    process.env.PAYMENT_SUCCESS_URL ?? 'http://localhost:3000/payment/success',
  cancelUrl:
    process.env.PAYMENT_CANCEL_URL ?? 'http://localhost:3000/payment/cancel',
  callbackBaseUrl:
    process.env.PAYMENT_CALLBACK_BASE_URL ?? 'http://localhost:8000/api/v1',
  defaultCurrency: process.env.PAYMENT_DEFAULT_CURRENCY ?? 'EUR',
  deliveryFee: Number(process.env.DELIVERY_FEE ?? 70),
}));
