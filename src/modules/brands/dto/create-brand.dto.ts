import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';
import { SeoFieldsDto } from '../../../shared/dtos/seo-fields.dto';

export class CreateBrandDto {
  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'title',
    }),
  })
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  title: FieldLocalizedDto;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  description?: FieldLocalizedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoFieldsDto)
  seo?: SeoFieldsDto;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsUrl({}, { message: i18nValidationMessage('validation.must_be_url') })
  website?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
