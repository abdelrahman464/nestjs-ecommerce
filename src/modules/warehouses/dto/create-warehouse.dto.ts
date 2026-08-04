import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class WarehouseAddressDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(200, {
    message: i18nValidationMessage('validation.max_length', { max: 200 }),
  })
  street?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(100, {
    message: i18nValidationMessage('validation.max_length', { max: 100 }),
  })
  city?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(20, {
    message: i18nValidationMessage('validation.max_length', { max: 20 }),
  })
  postalCode?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(3, {
    message: i18nValidationMessage('validation.max_length', { max: 3 }),
  })
  country?: string;
}

export class CreateWarehouseDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'name',
    }),
  })
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(120, {
    message: i18nValidationMessage('validation.max_length', { max: 120 }),
  })
  name: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'code',
    }),
  })
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(20, {
    message: i18nValidationMessage('validation.max_length', { max: 20 }),
  })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  code: string;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.must_be_boolean') })
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.must_be_boolean') })
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: i18nValidationMessage('validation.must_be_number') })
  @Min(0, { message: i18nValidationMessage('validation.min_value', { min: 0 }) })
  order?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WarehouseAddressDto)
  address?: WarehouseAddressDto;
}
