import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type, Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsPriceAfterDiscountValid } from '../../../common/validators/is-price-after-discount-valid.validator';
import { FieldLocalizedPartialDto } from '../../../shared/dtos/filed-localized.dto';
import { CreateProductDto } from './create-product.dto';

/**
 * Same pattern as UpdateCategoryDto:
 * - PartialType → every create field becomes optional (PATCH)
 * - OmitType → remove nested i18n fields that need a *partial* locale DTO
 * - Re-declare those nested fields with FieldLocalizedPartialDto
 *
 * Extra overrides below keep SKU transform + price invariant on update.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, [
    'title',
    'description',
    'shortDescription',
  ] as const),
) {
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  title?: FieldLocalizedPartialDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  description?: FieldLocalizedPartialDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  shortDescription?: FieldLocalizedPartialDto;

  /** Re-declare so Transform still runs on PATCH (PartialType can drop metadata). */
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === undefined || value === null
      ? value
      : String(value).trim().toUpperCase(),
  )
  sku?: string;

  /** Re-declare so @IsPriceAfterDiscountValid applies when only price fields change. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsPriceAfterDiscountValid()
  priceAfterDiscount?: number;
}
