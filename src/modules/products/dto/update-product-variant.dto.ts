import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsPriceAfterDiscountValid } from '../../../common/validators/is-price-after-discount-valid.validator';
import { CreateProductVariantDto } from './create-product-variant.dto';

/** Stock is omitted — change quantity via InventoryService / POST /inventory/movements. */
export class UpdateProductVariantDto extends PartialType(
  OmitType(CreateProductVariantDto, ['stock'] as const),
) {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim().toUpperCase(),
  )
  sku?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim(),
  )
  barcode?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsPriceAfterDiscountValid()
  priceAfterDiscount?: number;
}
