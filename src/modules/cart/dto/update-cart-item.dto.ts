import { IsInt, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateCartItemDto {
  @IsInt({ message: i18nValidationMessage('validation.must_be_integer') })
  @Min(1, { message: i18nValidationMessage('validation.min_value', { min: 1 }) })
  quantity: number;
}
