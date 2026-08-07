import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ManualOrderItemDto {
  @IsNotEmpty()
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  variantId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: i18nValidationMessage('validation.min_value', { min: 1 }) })
  quantity: number;
}

export class CreateManualOrderDto {
  @IsNotEmpty()
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  customerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items: ManualOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
