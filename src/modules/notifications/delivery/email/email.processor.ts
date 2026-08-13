import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  EMAIL_JOB_SEND,
  EMAIL_QUEUE,
  EmailJobPayload,
} from '../../../../queues/queues.constants';
import { EmailChannelStrategy } from './email.channel';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly emailChannel: EmailChannelStrategy,
    /** Pino logger — supports structured fields: logger.info({ jobId }, 'msg') */
    @InjectPinoLogger(EmailProcessor.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    if (job.name !== EMAIL_JOB_SEND) {
      this.logger.warn({ jobName: job.name }, 'Unknown email job');
      return;
    }

    const { to, subject, text, html } = job.data;
    this.logger.info(
      {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
        to,
      },
      'Sending email job',
    );

    try {
      await this.emailChannel.send(to, subject, text, html);
      this.logger.info({ jobId: job.id, to }, 'Email job done');
    } catch (error) {
      this.logger.error(
        {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          to,
          err: error instanceof Error ? error.message : String(error),
        },
        'Email job failed',
      );
      throw error; // rethrow so BullMQ can retry
    }
  }
}
