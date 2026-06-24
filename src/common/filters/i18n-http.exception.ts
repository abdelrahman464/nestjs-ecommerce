import { HttpException } from '@nestjs/common';

export class I18nHttpException extends HttpException {
  constructor(status: number, key: string, args?: Record<string, unknown>) {
    super({ message: key, args }, status);
  }
}

/*

usage:
 throw new I18nHttpException(HttpStatus.NOT_FOUND, 'user.notFound', {
        id: id.toString(),
      });

      or

    throw new I18nHttpException(409, 'user.alreadyExists', {
        email: email,
    });
*/
