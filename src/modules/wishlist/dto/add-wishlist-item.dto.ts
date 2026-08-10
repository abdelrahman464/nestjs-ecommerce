import { IsMongoId } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AddWishlistItemDto {
  @IsMongoId({
    message: i18nValidationMessage('validation.must_be_mongo_id'),
  })
  variantId: string;
}
