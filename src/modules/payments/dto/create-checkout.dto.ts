import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PaymentProvider } from '../enums/payment-provider.enum';

export class CreateCheckoutDto {
  @IsEnum(PaymentProvider, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  provider: PaymentProvider;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @Length(3, 3, {
    message: i18nValidationMessage('validation.must_be_string'),
  })
  currency?: string;
}
