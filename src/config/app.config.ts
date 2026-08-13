import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: process.env.PORT,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  /** Pino level: fatal|error|warn|info|debug|trace|silent */
  logLevel: process.env.LOG_LEVEL,
}));
