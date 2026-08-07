import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaymentProvider } from '../enums/payment-provider.enum';

const CHECKOUT_PROVIDERS = [
  PaymentProvider.STRIPE,
  PaymentProvider.KLARNA,
] as const;

export class CreateCheckoutDto {
  @IsIn([...CHECKOUT_PROVIDERS], {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  provider: (typeof CHECKOUT_PROVIDERS)[number];

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @Length(3, 3, {
    message: i18nValidationMessage('validation.must_be_string'),
  })
  currency?: string;
}
