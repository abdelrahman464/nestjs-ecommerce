import {
  Injectable,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { NotificationStrategyRegistry } from './strategy.registry';
import { NotificationType } from './enums/notification.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly strategyRegistry: NotificationStrategyRegistry,
  ) {}

  /**
   * Send notification using the specified strategy
   * @param type The notification type (EMAIL, SMS, etc.)
   * @param to Recipient address/phone number
   * @param subject Subject/title of the notification
   * @param message Message content
   */
  async send(
    type: NotificationType,
    to: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const strategy = this.strategyRegistry.get(type);

    if (!strategy) {
      const availableStrategies = Array.from(
        this.strategyRegistry.getAll().keys(),
      ).join(', ');
      this.logger.error(
        `Strategy '${type}' not found. Available strategies: ${availableStrategies}`,
      );
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'notification.strategyUnavailable',
        { type, available: availableStrategies },
      );
    }

    try {
      this.logger.log(`Sending ${type} notification to ${to}`);
      await strategy.send(to, subject, message);
      this.logger.log(`${type} notification sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send ${type} notification to ${to}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send email notification (convenience method)
   * @param to Recipient email address
   * @param subject Email subject
   * @param message Email message
   */
  async sendEmail(to: string, subject: string, message: string): Promise<void> {
    return this.send(NotificationType.EMAIL, to, subject, message);
  }

  /**
   * Check if a notification type is supported
   * @param type The notification type
   * @returns True if supported, false otherwise
   */
  isSupported(type: NotificationType): boolean {
    return this.strategyRegistry.has(type);
  }

  /**
   * Get all supported notification types
   * @returns Array of supported notification types
   */
  getSupportedTypes(): NotificationType[] {
    return Array.from(this.strategyRegistry.getAll().keys());
  }
}


