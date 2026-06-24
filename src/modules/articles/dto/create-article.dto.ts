import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FieldLocalizedDto } from '../../../shared/dtos/filed-localized.dto';

export class CreateArticleDto {
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

  @IsDefined({
    message: i18nValidationMessage('validation.field_required', {
      field: 'content',
    }),
  })
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  content: FieldLocalizedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  excerpt?: FieldLocalizedDto;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  metaTitle?: FieldLocalizedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  metaDescription?: FieldLocalizedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedDto)
  keywords?: FieldLocalizedDto;
}
