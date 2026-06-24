import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

function trimString(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  return String(value).trim();
}

export class FieldLocalizedDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'de',
    }),
  })
  @IsString()
  @Transform(({ value }) => trimString(value))
  de: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'en',
    }),
  })
  @IsString()
  @Transform(({ value }) => trimString(value))
  en: string;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @Transform(({ value }) => trimString(value))
  localized?: string;
}

/** PATCH: send only the locale(s) you want to change; others stay in the DB. */
export class FieldLocalizedPartialDto {
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'de',
    }),
  })
  @Transform(({ value }) => trimString(value))
  de?: string;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.field_required', {
      field: 'en',
    }),
  })
  @Transform(({ value }) => trimString(value))
  en?: string;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @Transform(({ value }) => trimString(value))
  localized?: string;
}
