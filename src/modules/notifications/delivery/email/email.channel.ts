import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationChannel } from '../../enums/notification-channel.enum';
import { INotificationChannelStrategy } from '../interfaces/notification-channel-strategy.interface';

/** SMTP delivery only — called by EmailProcessor (worker), not by HTTP handlers. */
@Injectable()
export class EmailChannelStrategy implements INotificationChannelStrategy {
  readonly channel = NotificationChannel.EMAIL;

  constructor(private readonly configService: ConfigService) {}

  async send(
    to: string,
    title: string,
    body: string,
    html?: string,
  ): Promise<void> {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: this.configService.get<string>('email.host'),
      port: Number(this.configService.get<string>('email.port')),
      secure: true,
      auth: {
        user: this.configService.get<string>('email.user'),
        pass: this.configService.get<string>('email.password'),
      },
    });

    const emailUser = this.configService.get<string>('email.user');
    const senderName = this.configService.get<string>('email.senderName');

    await transporter.sendMail({
      from: senderName ? `${senderName} <${emailUser}>` : `<${emailUser}>`,
      to,
      subject: title,
      text: body,
      ...(html ? { html } : {}),
    });
  }
}
