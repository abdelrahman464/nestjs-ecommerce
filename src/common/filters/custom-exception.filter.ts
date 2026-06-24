import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  I18nContext,
  I18nService,
  I18nValidationException,
  I18nValidationExceptionFilter,
} from 'nestjs-i18n';

// handle both HttpException and I18nValidationException 
// and handle the translation of the message
@Catch(HttpException)
export class CustomExceptionFilter extends I18nValidationExceptionFilter {
  constructor(private readonly i18n: I18nService) {
    super();
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    if (exception instanceof I18nValidationException) {
      return super.catch(exception, host);
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const exceptionResponse = exception.getResponse();
    const lang = I18nContext.current(host)?.lang;

    // Resolve the message — translate if it looks like an i18n key
    const resolved = this.resolveMessage(exceptionResponse, lang);

    response.status(status).json({
      ...resolved,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(process.env.NODE_ENV === 'development' && {
        stack: exception.stack,
      }),
    });
  }

  protected buildResponseBody(
    host: ArgumentsHost,
    exc: I18nValidationException,
    error: string[] | I18nValidationException['errors'] | object,
  ): Record<string, unknown> {
    const baseResponse = super.buildResponseBody(host, exc, error);
    const request = host.switchToHttp().getRequest<Request>();

    return {
      ...baseResponse,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(process.env.NODE_ENV === 'development' && {
        stack: exc.stack,
      }),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Detects whether a string looks like a dot-notation i18n key (e.g. "user.notFound")
   * rather than a plain human-readable sentence.
   */
  private isI18nKey(value: string): boolean {
    return /^[\w]+(?:\.[\w]+)+$/.test(value);
  }

  /**
   * Accepts the raw HttpException response and returns a plain object
   * with the message translated if it was an i18n key.
   *
   * Supported throw shapes:
   *   - throw new NotFoundException('some.key')
   *   - throw new NotFoundException({ message: 'some.key', args: {...} })
   *   - throw new NotFoundException({ key: 'some.key', args: {...} })
   */
  private resolveMessage(
    exceptionResponse: string | object,
    lang: string | undefined,
  ): object {
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const { args, key, message, ...rest } = exceptionResponse as Record<
        string,
        unknown
      >;

      const i18nKey =
        typeof key === 'string' && this.isI18nKey(key)
          ? key
          : typeof message === 'string' && this.isI18nKey(message)
            ? message
            : undefined;

      if (i18nKey) {
        return {
          ...rest,
          message: this.i18n.translate(i18nKey, {
            lang,
            args: (args as Record<string, unknown>) ?? {},
          }),
        };
      }

      return { ...rest, ...(message !== undefined && { message }) };
    }

    if (typeof exceptionResponse === 'string') {
      return {
        message: this.isI18nKey(exceptionResponse)
          ? this.i18n.translate(exceptionResponse, { lang })
          : exceptionResponse,
      };
    }

    return { message: exceptionResponse };
  }
}