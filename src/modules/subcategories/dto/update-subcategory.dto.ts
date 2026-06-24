import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { FieldLocalizedPartialDto } from '../../../shared/dtos/filed-localized.dto';
import { CreateSubCategoryDto } from './create-subcategory.dto';

export class UpdateSubCategoryDto extends PartialType(
  OmitType(CreateSubCategoryDto, ['title', 'description'] as const),
) {
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  title?: FieldLocalizedPartialDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  description?: FieldLocalizedPartialDto;
}
