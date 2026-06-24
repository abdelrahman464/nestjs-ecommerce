import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { INotificationStrategy } from './interfaces/notification-strategy.interface';
import { NotificationType } from './enums/notification.enum';

@Injectable()
export class NotificationStrategyRegistry implements OnModuleInit {
  private readonly logger = new Logger(NotificationStrategyRegistry.name);
  private readonly strategies = new Map<NotificationType, INotificationStrategy>();

  onModuleInit() {
    this.logger.log('Notification Strategy Registry initialized');
  }

  /**
   * Register a notification strategy
   * @param strategy The strategy instance to register
   */
  register(strategy: INotificationStrategy): void {
    const type = strategy.name as NotificationType;
    this.strategies.set(type, strategy);
    this.logger.log(`Strategy '${type}' registered successfully`);
  }

  /**
   * Get a strategy by type
   * @param type The notification type
   * @returns The strategy instance or undefined if not found
   */
  get(type: NotificationType): INotificationStrategy | undefined {
    return this.strategies.get(type);
  }

  /**
   * Get all registered strategies
   * @returns Map of all registered strategies
   */
  getAll(): Map<NotificationType, INotificationStrategy> {
    return new Map(this.strategies);
  }

  /**
   * Check if a strategy is registered
   * @param type The notification type
   * @returns True if strategy is registered, false otherwise
   */
  has(type: NotificationType): boolean {
    return this.strategies.has(type);
  }

  /**
   * Unregister a strategy
   * @param type The notification type
   */
  unregister(type: NotificationType): void {
    if (this.strategies.delete(type)) {
      this.logger.log(`Strategy '${type}' unregistered successfully`);
    }
  }
}


