import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { InventoryDirection } from '../enums/inventory-direction.enum';
import {
  InventoryMovementType,
  MANUAL_MOVEMENT_TYPES,
  ManualMovementType,
} from '../enums/inventory-movement-type.enum';

export class CreateInventoryMovementDto {
  @IsNotEmpty({ message: i18nValidationMessage('validation.field_required', { field: 'variantId' }) })
  @IsMongoId({ message: i18nValidationMessage('validation.must_be_mongo_id') })
  variantId: string;

  @IsNotEmpty({ message: i18nValidationMessage('validation.field_required', { field: 'type' }) })
  @IsIn([...MANUAL_MOVEMENT_TYPES], {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  type: ManualMovementType;

  @IsNotEmpty({ message: i18nValidationMessage('validation.field_required', { field: 'quantity' }) })
  @Type(() => Number)
  @IsNumber({}, { message: i18nValidationMessage('validation.must_be_number') })
  @Min(1, { message: i18nValidationMessage('validation.min_value', { min: 1 }) })
  quantity: number;

  /**
   * Required only for `adjustment`.
   * Server forces direction for restock/return/damage.
   */
  @ValidateIf((o: CreateInventoryMovementDto) => o.type === InventoryMovementType.ADJUSTMENT)
  @IsNotEmpty({ message: i18nValidationMessage('validation.field_required', { field: 'direction' }) })
  @IsEnum(InventoryDirection, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  direction?: InventoryDirection;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.must_be_string') })
  @MaxLength(500, {
    message: i18nValidationMessage('validation.max_length', { max: 500 }),
  })
  reason?: string;
}
