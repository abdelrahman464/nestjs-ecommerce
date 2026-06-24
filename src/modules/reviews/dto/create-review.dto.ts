import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateReviewDto {
  @IsMongoId({
    message: i18nValidationMessage('validation.must_be_mongo_id'),
  })
  productId: string;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @MaxLength(120, {
    message: i18nValidationMessage('validation.max_length', {
      max: '$constraint1',
    }),
  })
  title?: string;

  @IsNumber(
    {},
    {
      message: i18nValidationMessage('validation.must_be_number'),
    },
  )
  @Min(1, {
    message: i18nValidationMessage('validation.min_value', {
      min: '$constraint1',
    }),
  })
  @Max(5, {
    message: i18nValidationMessage('validation.max_value', {
      max: '$constraint1',
    }),
  })
  ratings: number;
}
