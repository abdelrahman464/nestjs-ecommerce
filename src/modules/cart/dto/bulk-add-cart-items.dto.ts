import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { AddCartItemDto } from './add-cart-item.dto';

export class BulkAddCartItemsDto {
  @IsArray({
    message: i18nValidationMessage('validation.must_be_array'),
  })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.min_value', { min: 1 }),
  })
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  items: AddCartItemDto[];
}
