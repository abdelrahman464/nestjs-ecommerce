import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationChannelRegistry } from './delivery/channel.registry';
import { EmailChannelStrategy } from './delivery/email/email.channel';
import { EmailProcessor } from './delivery/email/email.processor';
import { NotificationService } from './notification.service';
import { EmailTemplateService } from './templates/email-template.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NotificationChannelRegistry,
    EmailChannelStrategy,
    EmailProcessor,
    EmailTemplateService,
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationModule implements OnModuleInit {
  constructor(
    private readonly channelRegistry: NotificationChannelRegistry,
    private readonly emailChannel: EmailChannelStrategy,
  ) {}

  onModuleInit() {
    this.channelRegistry.register(this.emailChannel);
  }
}
