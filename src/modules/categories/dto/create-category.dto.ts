import {
  IsBoolean,
  IsDefined,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Types } from 'mongoose';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';
import { SeoFieldsDto } from '../../../shared/dtos/seo-fields.dto';

export class CreateCategoryDto {
  @IsOptional()
  @IsMongoId()
  parentCategory?: Types.ObjectId;

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
  @ValidateNested()
  @Type(() => SeoFieldsDto)
  seo?: SeoFieldsDto;

  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.must_be_boolean'),
  })
  isActive?: boolean;
}
