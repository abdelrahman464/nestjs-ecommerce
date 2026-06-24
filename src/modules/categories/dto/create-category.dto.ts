import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';

export class CreateCategoryDto {
  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'title',
    }),
  })
  @ValidateNested() // to allow all the validations on the nested object (FieldLocalizedDto) because nest process on top level objects first
  @Type(() => FieldLocalizedDto) // return instance of FieldLocalizedDto
  title: FieldLocalizedDto;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  slug?: string;

  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'description',
    }),
  })
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  description: FieldLocalizedDto;

  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.must_be_boolean'),
  })
  isActive?: boolean;
}
