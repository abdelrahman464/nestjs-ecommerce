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
 * HttpException / validation stay on CustomExceptionFilter (@Catch(HttpException)).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    // Prefer the dedicated HttpException filter when Nest routes here anyway.
    if (exception instanceof HttpException) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
      const status = exception.getStatus();
      const body = exception.getResponse();
      return response.status(status).json({
        ...(typeof body === 'object' && body !== null ? body : { message: body }),
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = I18nContext.current(host)?.lang;

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

  private translate(
    key: string,
    lang: string | undefined,
    args?: Record<string, unknown>,
  ): string {
    return this.i18n.translate(key, { lang, args: args ?? {} }) as string;
  }
}
