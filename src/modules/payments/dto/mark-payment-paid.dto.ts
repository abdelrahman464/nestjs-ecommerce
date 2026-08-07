import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class MarkPaymentPaidDto {
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: i18nValidationMessage('validation.must_be_url') })
  @Type(() => String)
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: i18nValidationMessage('validation.max_length', { max: 1000 }),
  })
  note?: string;
}
