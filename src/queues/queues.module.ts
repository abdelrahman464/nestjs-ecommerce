import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_QUEUE,
  PAYMENT_RECONCILIATION_QUEUE,
} from './queues.constants';

/**
 * Only BullMQ plumbing:
 * - Redis connection
 * - Register queue names
 *
 * Workers / schedulers / producers live in their feature modules
 * (NotificationModule, PaymentsModule) — same pattern as email.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url') || 'redis://127.0.0.1:6379',
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: PAYMENT_RECONCILIATION_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
