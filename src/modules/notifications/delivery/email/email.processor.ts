import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  EMAIL_JOB_SEND,
  EMAIL_QUEUE,
  EmailJobPayload,
} from '../../../../queues/queues.constants';
import { EmailChannelStrategy } from './email.channel';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailChannel: EmailChannelStrategy) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    if (job.name !== EMAIL_JOB_SEND) {
      this.logger.warn(`Unknown email job: ${job.name}`);
      return;
    }

    const { to, subject, text, html } = job.data;
    this.logger.log(`Sending email job ${job.id} → ${to}`);
    await this.emailChannel.send(to, subject, text, html);
    this.logger.log(`Email job ${job.id} done`);
  }
}
