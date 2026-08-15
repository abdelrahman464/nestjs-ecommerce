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
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Types } from 'mongoose';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';
import { SeoFieldsDto } from '../../../shared/dtos/seo-fields.dto';
import {
  MAX_PRODUCT_OPTION_TYPES,
  ProductOptionType,
} from '../enums/product-option-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { CreateDefaultVariantDto } from './create-product-variant.dto';
import { ProductOptionDefinitionDto } from './product-option-definition.dto';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoFieldsDto)
  seo?: SeoFieldsDto;

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
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTION_TYPES)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDefinitionDto)
  optionDefinitions?: ProductOptionDefinitionDto[];

  @IsOptional()
  @IsEnum(ProductOptionType)
  groupBy?: ProductOptionType | null;

  /** Initial sellable unit (always created with the product). */
  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'defaultVariant',
    }),
  })
  @ValidateNested()
  @Type(() => CreateDefaultVariantDto)
  defaultVariant: CreateDefaultVariantDto;
}

/*
HTTP create body minus defaultVariant (variant is written to another collection)
*/
export type CreateProductPersistence = Omit<
  CreateProductDto,
  'defaultVariant'
> & {
  slug: string;
  order: number;
  status: ProductStatus;
  optionDefinitions: ProductOptionDefinitionDto[];
  groupBy: ProductOptionType | null;
};
