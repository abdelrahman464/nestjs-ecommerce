import { Injectable, PipeTransform, HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { I18nHttpException } from '../filters/i18n-http.exception';

// ✅ Parse and validate MongoDB ObjectId
@Injectable()
export class ParseObjectIdPipe implements PipeTransform {
  transform(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'common.invalidId');
    }
    return new Types.ObjectId(value);
  }
}
