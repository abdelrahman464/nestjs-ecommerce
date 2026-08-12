import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { INotificationChannelStrategy } from './interfaces/notification-channel-strategy.interface';

@Injectable()
export class NotificationChannelRegistry {
  private readonly logger = new Logger(NotificationChannelRegistry.name);
  private readonly strategies = new Map<
    NotificationChannel,
    INotificationChannelStrategy
  >();

  register(strategy: INotificationChannelStrategy): void {
    this.strategies.set(strategy.channel, strategy);
    this.logger.log(`Channel '${strategy.channel}' registered`);
  }

  get(channel: NotificationChannel): INotificationChannelStrategy | undefined {
    return this.strategies.get(channel);
  }

  has(channel: NotificationChannel): boolean {
    return this.strategies.has(channel);
  }

  getAll(): Map<NotificationChannel, INotificationChannelStrategy> {
    return new Map(this.strategies);
  }
}
