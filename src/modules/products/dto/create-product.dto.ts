import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Types } from 'mongoose';
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
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  material?: FieldLocalizedDto;

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

  @IsOptional()
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  metaTitle?: FieldLocalizedDto;

  @IsOptional()
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  metaDescription?: FieldLocalizedDto;

  @IsOptional()
  @Type(() => FieldLocalizedDto)
  @ValidateNested()
  keywords?: FieldLocalizedDto;
}
