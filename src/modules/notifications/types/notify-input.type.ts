import { NotificationChannel } from '../enums/notification-channel.enum';
import { EmailTemplateId } from '../templates/email-template-id.enum';
import { EmailTemplateVars } from '../templates/email-template.types';

/**
 * Input for NotificationService.notify().
 * Prefer `template` + `vars` for emails (no raw string bodies in callers).
 */
export type NotifyInput = {
  to: string;
  /** Defaults to [EMAIL]. */
  channels?: NotificationChannel[];
  /**
   * Future: when set, also create an in-app Notification document.
   */
  userId?: string;
  /** Which email template to render */
  template: EmailTemplateId;
  /** Values for {{placeholders}} in the template */
  vars: EmailTemplateVars;
};
