import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { INotificationStrategy } from '../interfaces/notification-strategy.interface';
import { NotificationType } from '../enums/notification.enum';

@Injectable()
export class EmailNotificationStrategy implements INotificationStrategy {
  name = NotificationType.EMAIL;

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, subject: string, message: string): Promise<void> {
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
      from: senderName
        ? `${senderName} <${emailUser}>`
        : `<${emailUser}>`,
      to,
      subject,
      text: message,
    });
  }
}


