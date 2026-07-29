import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  MAX_PRODUCT_OPTION_TYPES,
  ProductOptionType,
} from '../enums/product-option-type.enum';

export class ProductOptionDefinitionDto {
  @IsEnum(ProductOptionType, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  type: ProductOptionType;

  @IsArray({ message: i18nValidationMessage('validation.must_be_array') })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.min_value', { min: 1 }),
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  values: string[];

  @IsInt()
  @Min(0)
  order: number;
}

export class ProductOptionDefinitionsDto {
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTION_TYPES)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDefinitionDto)
  definitions: ProductOptionDefinitionDto[];
}
