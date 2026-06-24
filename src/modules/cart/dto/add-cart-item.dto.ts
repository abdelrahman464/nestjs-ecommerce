import { IsInt, IsMongoId, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AddCartItemDto {
  @IsMongoId({
    message: i18nValidationMessage('validation.must_be_mongo_id'),
  })
  productId: string;

  @IsInt({ message: i18nValidationMessage('validation.must_be_integer') })
  @Min(1, { message: i18nValidationMessage('validation.min_value', { min: 1 }) })
  quantity: number;
}
