import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Types } from 'mongoose';

export class ReorderProductItemDto {
  @IsMongoId({
    message: i18nValidationMessage('validation.must_be_mongo_id'),
  })
  productId: Types.ObjectId;

  @IsInt({ message: i18nValidationMessage('validation.must_be_integer') })
  @Min(0, {
    message: i18nValidationMessage('validation.min_value', { min: 0 }),
  })
  order: number;
}

export class ReorderProductsDto {
  @IsArray({
    message: i18nValidationMessage('validation.must_be_array'),
  })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.min_value', { min: 1 }),
  })
  @ValidateNested({ each: true })
  @Type(() => ReorderProductItemDto)
  items: ReorderProductItemDto[];
}
