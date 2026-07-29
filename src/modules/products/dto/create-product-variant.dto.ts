import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsPriceAfterDiscountValid } from '../../../common/validators/is-price-after-discount-valid.validator';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

export class CreateProductVariantDto {
  @IsNotEmpty({ message: i18nValidationMessage('validation.sku_required') })
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim().toUpperCase(),
  )
  sku: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.barcode_required'),
  })
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim(),
  )
  barcode: string;

  /** Option selections, e.g. { color: "red", size: "48" }. Omit/{} for default. */
  @IsOptional()
  @IsObject()
  options?: Record<string, string>;

  @IsNotEmpty({ message: i18nValidationMessage('validation.price_required') })
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsPriceAfterDiscountValid()
  priceAfterDiscount?: number;

  @IsNotEmpty({ message: i18nValidationMessage('validation.stock_required') })
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
  isDefault?: boolean;

  @IsOptional()
  @IsNumber()
  order?: number;
}

export class CreateDefaultVariantDto {
  @IsNotEmpty({ message: i18nValidationMessage('validation.sku_required') })
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim().toUpperCase(),
  )
  sku: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.barcode_required'),
  })
  @IsString()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim(),
  )
  barcode: string;

  /** Required when the product has optionDefinitions. */
  @IsOptional()
  @IsObject()
  options?: Record<string, string>;

  @IsNotEmpty({ message: i18nValidationMessage('validation.price_required') })
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsPriceAfterDiscountValid()
  priceAfterDiscount?: number;

  @IsNotEmpty({ message: i18nValidationMessage('validation.stock_required') })
  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;
}

export type CreateProductVariantPersistence = CreateProductVariantDto & {
  product: import('mongoose').Types.ObjectId;
  optionsKey: string;
  options: Record<string, string>;
  priceAfterDiscount: number;
  status: ProductStatus;
  isDefault: boolean;
  order: number;
};
