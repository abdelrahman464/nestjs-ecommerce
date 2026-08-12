import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PAYMENT_RECONCILIATION_JOB_SWEEP,
  PAYMENT_RECONCILIATION_QUEUE,
} from '../../queues/queues.constants';
import { PaymentReconciliationService } from './payment-reconciliation.service';

/**
 * WORKER for payment-reconciliation queue (lives with payments domain,
 * same idea as EmailProcessor living with notifications).
 */
@Processor(PAYMENT_RECONCILIATION_QUEUE)
export class PaymentReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentReconciliationProcessor.name);

  constructor(
    private readonly paymentReconciliationService: PaymentReconciliationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PAYMENT_RECONCILIATION_JOB_SWEEP) {
      this.logger.warn(`Unknown reconciliation job: ${job.name}`);
      return;
    }

    this.logger.debug(`Reconciliation sweep (job ${job.id})`);
    await this.paymentReconciliationService.sweep();
  }
}
