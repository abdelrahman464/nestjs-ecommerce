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
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';
import { Types } from 'mongoose';

export class CreateSubCategoryDto {
  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'category',
    }),
  })
  @IsMongoId()
  category: Types.ObjectId;

  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'title',
    }),
  })
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
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
