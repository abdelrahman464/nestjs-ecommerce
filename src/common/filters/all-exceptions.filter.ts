import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { mapMongoError } from '../utils/mongo-error.util';

/**
 * Catch-all for non-HttpException failures (Mongo duplicate keys, CastError, etc.).
 *
 * HttpException should normally hit CustomExceptionFilter first (see main.ts filter
 * order + Nest's reverse). This filter still translates if an HttpException lands here.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = I18nContext.current(host)?.lang;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return response.status(status).json({
        ...this.resolveHttpBody(body, lang),
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    const mongoMapped = mapMongoError(exception);
    if (mongoMapped) {
      return response.status(mongoMapped.statusCode).json({
        message: this.translate(
          mongoMapped.message,
          lang,
          mongoMapped.args,
        ),
        statusCode: mongoMapped.statusCode,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    this.logger.error(
      `Unhandled ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return response.status(status).json({
      message: this.translate('common.internalError', lang),
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(process.env.NODE_ENV === 'development' &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    });
  }

  private resolveHttpBody(
    body: string | object,
    lang: string | undefined,
  ): Record<string, unknown> {
    if (typeof body === 'string') {
      return {
        message: this.isI18nKey(body)
          ? this.translate(body, lang)
          : body,
      };
    }

    if (typeof body === 'object' && body !== null) {
      const { args, key, message, ...rest } = body as Record<string, unknown>;
      const i18nKey =
        typeof key === 'string' && this.isI18nKey(key)
          ? key
          : typeof message === 'string' && this.isI18nKey(message)
            ? message
            : undefined;

      if (i18nKey) {
        return {
          ...rest,
          message: this.translate(
            i18nKey,
            lang,
            (args as Record<string, unknown>) ?? {},
          ),
        };
      }

      return {
        ...rest,
        ...(message !== undefined && { message }),
      };
    }

    return { message: body };
  }

  private isI18nKey(value: string): boolean {
    return /^[\w]+(?:\.[\w]+)+$/.test(value);
  }

  private translate(
    key: string,
    lang: string | undefined,
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.translate(key, { lang, args: args ?? {} }) as string;
  }
}
