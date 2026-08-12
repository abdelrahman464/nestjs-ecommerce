import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_QUEUE } from './queues.constants';

/**
 * Central place for BullMQ:
 * 1) Redis connection (forRoot)
 * 2) Register every queue name used in the app
 *
 * Feature modules PRODUCE/CONSUME via @InjectQueue / @Processor —
 * they do not call registerQueue themselves.
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
      // later: { name: PAYMENT_RECONCILIATION_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
