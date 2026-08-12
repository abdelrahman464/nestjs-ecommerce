import { NotificationChannel } from '../../enums/notification-channel.enum';

/** One delivery channel (email, sms, …). */
export interface INotificationChannelStrategy {
  readonly channel: NotificationChannel;
  send(
    to: string,
    title: string,
    body: string,
    html?: string,
  ): Promise<void>;
}
