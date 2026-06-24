import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { Observable, map } from 'rxjs';
import { LOCALIZE_MODE_KEY } from '../decorators/localize.decorator';
import { LocalizeMode } from '../enums/localize-mode.enum';
import { isPaginatedResponse } from '../utils/pagination.util';

const DEFAULT_LOCALE = 'de';

type LocalizeMethod = 'toJSONLocalizedOnly' | 'toJSONLocalized';

type MongooseLocalizable = {
  [K in LocalizeMethod]?: (
    resource: unknown,
    locale: string,
    localeDefault?: string,
  ) => unknown;
};

@Injectable()
export class LocalizationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const mode =
      this.reflector.getAllAndOverride<LocalizeMode>(LOCALIZE_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? LocalizeMode.ONLY;

    const method: LocalizeMethod =
      mode === LocalizeMode.ALL ? 'toJSONLocalized' : 'toJSONLocalizedOnly';

    return next.handle().pipe(
      map((data) => {
        const lang = I18nContext.current(context)?.lang ?? DEFAULT_LOCALE;
        return this.localize(data, lang, method);
      }),
    );
  }

  private localize(
    value: unknown,
    lang: string,
    method: LocalizeMethod,
  ): unknown {
    if (value === null || value === undefined) return value;

    if (isPaginatedResponse(value)) {
      return {
        ...value,
        data: this.localizeArray(value.data, lang, method),
      };
    }

    if (Array.isArray(value)) {
      return this.localizeArray(value, lang, method);
    }

    if (this.hasLocalizer(value, method)) {
      return value[method]!(value, lang, DEFAULT_LOCALE);
    }

    return value;
  }

  private localizeArray(
    arr: unknown[],
    lang: string,
    method: LocalizeMethod,
  ): unknown {
    return arr.map((item) =>
      this.hasLocalizer(item, method)
        ? item[method]!(item, lang, DEFAULT_LOCALE)
        : item,
    );
  }

  private hasLocalizer(
    value: unknown,
    method: LocalizeMethod,
  ): value is Required<Pick<MongooseLocalizable, LocalizeMethod>> {
    return (
      !!value &&
      typeof value === 'object' &&
      typeof (value as MongooseLocalizable)[method] === 'function'
    );
  }
}
