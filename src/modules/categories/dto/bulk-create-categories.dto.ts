import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { CreateCategoryDto } from './create-category.dto';

export class BulkCreateCategoriesDto {
  @IsArray({
    message: i18nValidationMessage('validation.must_be_array'),
  })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.min_value', { min: 1 }),
  })
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  categories: CreateCategoryDto[];
}
