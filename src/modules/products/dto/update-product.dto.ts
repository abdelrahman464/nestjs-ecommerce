import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { FieldLocalizedPartialDto } from '../../../shared/dtos/filed-localized.dto';
import {
  MAX_PRODUCT_OPTION_TYPES,
  ProductOptionType,
} from '../enums/product-option-type.enum';
import { CreateProductDto } from './create-product.dto';
import { ProductOptionDefinitionDto } from './product-option-definition.dto';

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, [
    'title',
    'description',
    'shortDescription',
    'defaultVariant',
    'optionDefinitions',
    'groupBy',
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_OPTION_TYPES)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDefinitionDto)
  optionDefinitions?: ProductOptionDefinitionDto[];

  @IsOptional()
  @IsEnum(ProductOptionType)
  groupBy?: ProductOptionType | null;
}
