import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import {
  FieldLocalizedDto,
  FieldLocalizedPartialDto,
} from './filed-localized.dto';

/** Nested `seo` block for create bodies. */
export class SeoFieldsDto {
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

/** Nested `seo` block for PATCH bodies (partial locales OK). */
export class SeoFieldsPartialDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  metaTitle?: FieldLocalizedPartialDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  metaDescription?: FieldLocalizedPartialDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldLocalizedPartialDto)
  keywords?: FieldLocalizedPartialDto;
}
