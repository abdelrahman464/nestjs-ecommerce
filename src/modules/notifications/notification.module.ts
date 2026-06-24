import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationStrategyRegistry } from './strategy.registry';
import { EmailNotificationStrategy } from './strategies/email.strategy';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NotificationStrategyRegistry,
    EmailNotificationStrategy,
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationModule implements OnModuleInit {
  constructor(
    private readonly strategyRegistry: NotificationStrategyRegistry,
    private readonly emailStrategy: EmailNotificationStrategy,
  ) {}

  onModuleInit() {
    // Register all strategies on module initialization
    this.strategyRegistry.register(this.emailStrategy);
    // Future strategies can be registered here:
    // this.strategyRegistry.register(this.smsStrategy);
    // this.strategyRegistry.register(this.whatsappStrategy);
  }
}

