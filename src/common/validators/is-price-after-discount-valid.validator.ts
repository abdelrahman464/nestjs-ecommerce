import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/**
 * Ensures priceAfterDiscount <= price when both are present on the same payload.
 * Partial updates that only send one field are validated in the service against DB state.
 */
export function IsPriceAfterDiscountValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPriceAfterDiscountValid',
      target: object.constructor,
      propertyName,
      options: {
        message:
          validationOptions?.message ??
          i18nValidationMessage('validation.price_after_discount_invalid'),
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          const price = (args.object as { price?: number }).price;
          if (typeof value !== 'number') return false;
          if (typeof price !== 'number') return true;
          return value <= price;
        },
      },
    });
  };
}
