import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { Queue } from 'bullmq';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import {
  EMAIL_JOB_SEND,
  EMAIL_QUEUE,
  EmailJobPayload,
} from '../../queues/queues.constants';
import { NotificationChannelRegistry } from './delivery/channel.registry';
import { NotificationChannel } from './enums/notification-channel.enum';
import { EmailTemplateService } from './templates/email-template.service';
import { EmailTemplateId } from './templates/email-template-id.enum';
import { EmailTemplateVars } from './templates/email-template.types';
import { NotifyInput } from './types/notify-input.type';

/**
 * Facade for notifying users.
 *
 * Emails: render template → enqueue BullMQ job → worker sends SMTP.
 * Later: also persist in-app Notification when userId is set.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly channelRegistry: NotificationChannelRegistry,
    private readonly emailTemplates: EmailTemplateService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    // Future inbox:
    // if (input.userId) { await this.notificationRepo.create(...) }

    const rendered = this.emailTemplates.render(input.template, input.vars);
    const channels = input.channels ?? [NotificationChannel.EMAIL];

    for (const channel of channels) {
      await this.dispatchChannel(
        channel,
        input.to,
        rendered.subject,
        rendered.text,
        rendered.html,
      );
    }
  }

  /** Typed helper for email-only callers (auth, payments). */
  async sendEmail(
    to: string,
    template: EmailTemplateId,
    vars: EmailTemplateVars,
  ): Promise<void> {
    return this.notify({
      to,
      template,
      vars,
      channels: [NotificationChannel.EMAIL],
    });
  }

  isSupported(channel: NotificationChannel): boolean {
    return this.channelRegistry.has(channel);
  }

  getSupportedChannels(): NotificationChannel[] {
    return Array.from(this.channelRegistry.getAll().keys());
  }

  private async dispatchChannel(
    channel: NotificationChannel,
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    switch (channel) {
      case NotificationChannel.EMAIL:
        await this.enqueueEmail(to, subject, text, html);
        return;
      default: {
        const strategy = this.channelRegistry.get(channel);
        if (!strategy) {
          throw new I18nHttpException(
            HttpStatus.BAD_REQUEST,
            'notification.strategyUnavailable',
            {
              type: channel,
              available: Array.from(this.channelRegistry.getAll().keys()).join(
                ', ',
              ),
            },
          );
        }
        await strategy.send(to, subject, text);
      }
    }
  }

  private async enqueueEmail(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const payload: EmailJobPayload = { to, subject, text, html };
    const job = await this.emailQueue.add(EMAIL_JOB_SEND, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    this.logger.log(`Queued email job ${job.id} → ${to}`);
  }
}
