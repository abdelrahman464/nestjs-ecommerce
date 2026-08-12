import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
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
  private readonly logger = new Logger(PaymentReconciliationScheduler.name);

  constructor(
    @InjectQueue(PAYMENT_RECONCILIATION_QUEUE)
    private readonly reconciliationQueue: Queue,
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

    this.logger.log(
      `Payment reconciliation scheduled every ${PAYMENT_RECONCILIATION_EVERY_MS / 1000}s (BullMQ)`,
    );
  }
}
