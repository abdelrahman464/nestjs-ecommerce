import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsMongoId, IsOptional, ValidateNested } from 'class-validator';
import { Types } from 'mongoose';
import { FieldLocalizedPartialDto } from '../../../shared/dtos/filed-localized.dto';
import { SeoFieldsPartialDto } from '../../../shared/dtos/seo-fields.dto';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['title', 'description', 'seo'] as const),
) {
  @IsOptional()
  @IsMongoId()
  parentCategory?: Types.ObjectId | null;

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
  @Type(() => SeoFieldsPartialDto)
  seo?: SeoFieldsPartialDto;
}
