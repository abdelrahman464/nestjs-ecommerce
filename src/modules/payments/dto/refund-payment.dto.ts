import { IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RefundPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: i18nValidationMessage('validation.max_length', { max: 1000 }),
  })
  reason?: string;
}
