import { registerAs } from '@nestjs/config';

export default registerAs('klarna', () => ({
  username: process.env.KLARNA_USERNAME,
  password: process.env.KLARNA_PASSWORD,
  apiUrl: process.env.KLARNA_API_URL ?? 'https://api.playground.klarna.com',
  checkoutUrl:
    process.env.KLARNA_CHECKOUT_URL ??
    'https://checkout.playground.klarna.com',
  purchaseCountry: process.env.KLARNA_PURCHASE_COUNTRY ?? 'DE',
  locale: process.env.KLARNA_LOCALE ?? 'de-DE',
}));
