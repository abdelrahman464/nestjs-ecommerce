import { Type } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateInventoryTransferDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'variantId',
    }),
  })
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  variantId: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'fromWarehouseId',
    }),
  })
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  fromWarehouseId: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'toWarehouseId',
    }),
  })
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  toWarehouseId: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'quantity',
    }),
  })
  @Type(() => Number)
  @IsNumber({}, { message: i18nValidationMessage('validation.must_be_number') })
  @Min(1, {
    message: i18nValidationMessage('validation.min_value', { min: 1 }),
  })
  quantity: number;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(500, {
    message: i18nValidationMessage('validation.max_length', { max: 500 }),
  })
  reason?: string;
}
