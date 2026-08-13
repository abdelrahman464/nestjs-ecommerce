import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
  constructor(
    private readonly paymentReconciliationService: PaymentReconciliationService,
    @InjectPinoLogger(PaymentReconciliationProcessor.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PAYMENT_RECONCILIATION_JOB_SWEEP) {
      this.logger.warn({ jobName: job.name }, 'Unknown reconciliation job');
      return;
    }

    this.logger.debug({ jobId: job.id }, 'Reconciliation sweep');
    await this.paymentReconciliationService.sweep();
  }
}
