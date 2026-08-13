import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

/**
 * nestjs-pino / pino-http options.
 *
 * Dev  → pretty one-line logs (human-readable in the terminal).
 * Prod → raw JSON (ship to Datadog / CloudWatch / Loki later).
 *
 * Existing `new Logger(Class.name)` from @nestjs/common keeps working —
 * Nest routes those calls through Pino after `app.useLogger(...)` in main.ts.
 */
export function buildLoggerParams(config: ConfigService): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const level =
    config.get<string>('app.logLevel') ?? (isProd ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,
      // Assign a request id (also sent as `x-request-id` response header by default).
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id =
          (Array.isArray(existing) ? existing[0] : existing) ||
          randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
      // Never print auth cookies / bearer tokens into logs.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
        ],
        remove: true,
      },
      // Keep access logs small — method/url/status, not full headers/body.
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customProps: () => ({
        context: 'HTTP',
      }),
      // Skip noisy probes if you add a health route later.
      autoLogging: {
        ignore: (req) =>
          typeof req.url === 'string' && req.url.includes('/health'),
      },
    },
  };
}
