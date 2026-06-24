import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { AddCartItemDto } from './add-cart-item.dto';

export class SyncCartDto {
  @IsArray({ message: i18nValidationMessage('validation.must_be_array') })
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  items: AddCartItemDto[];
}
