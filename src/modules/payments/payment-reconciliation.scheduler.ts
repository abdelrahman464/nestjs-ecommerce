import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  PAYMENT_RECONCILIATION_EVERY_MS,
  PAYMENT_RECONCILIATION_JOB_SWEEP,
  PAYMENT_RECONCILIATION_QUEUE,
  PAYMENT_RECONCILIATION_SCHEDULER_ID,
} from '../../queues/queues.constants';

/**
 * Registers the every-60s BullMQ scheduler (replaces @Cron).
 * Lives with payments domain — QueuesModule only owns Redis + queue names.
 */
@Injectable()
export class PaymentReconciliationScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(PAYMENT_RECONCILIATION_QUEUE)
    private readonly reconciliationQueue: Queue,
    @InjectPinoLogger(PaymentReconciliationScheduler.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconciliationQueue.upsertJobScheduler(
      PAYMENT_RECONCILIATION_SCHEDULER_ID,
      { every: PAYMENT_RECONCILIATION_EVERY_MS },
      {
        name: PAYMENT_RECONCILIATION_JOB_SWEEP,
        data: {},
        opts: {
          removeOnComplete: 20,
          removeOnFail: 50,
        },
      },
    );

    this.logger.info(
      { everyMs: PAYMENT_RECONCILIATION_EVERY_MS },
      'Payment reconciliation scheduler registered',
    );
  }
}
