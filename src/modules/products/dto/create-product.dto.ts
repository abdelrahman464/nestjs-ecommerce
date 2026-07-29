import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Types } from 'mongoose';
import { IsPriceAfterDiscountValid } from '../../../common/validators/is-price-after-discount-valid.validator';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

export class CreateProductDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.category_required'),
  })
  @IsMongoId()
  category: Types.ObjectId;

  @IsOptional()
  @IsMongoId()
  brand?: Types.ObjectId;

  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'title',
    }),
  })
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  title: FieldLocalizedDto;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'description',
    }),
  })
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  description: FieldLocalizedDto;

  @IsOptional()
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  shortDescription?: FieldLocalizedDto;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.sku_required'),
  })
  @IsString()
  @Transform(({ value }) =>
    value === undefined || value === null
      ? value
      : String(value).trim().toUpperCase(),
  )
  sku: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.price_required'),
  })
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsPriceAfterDiscountValid()
  priceAfterDiscount?: number;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.stock_required'),
  })
  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  showOnBanner?: boolean;

  @IsOptional()
  @IsNumber()
  order?: number;
}

/** Persistence payload after service enriches slug / order / status. */
//slug: string - Required after service generates it (DTO had slug?)
// order: number - Required after defaulting to maxOrder + 1
// status: ProductStatus - Required after resolveProductStatus()
// priceAfterDiscount: number - Required after resolvePriceAfterDiscount()
export type CreateProductPersistence = CreateProductDto & {
  slug: string;
  order: number;
  status: ProductStatus;
  priceAfterDiscount: number;
};
