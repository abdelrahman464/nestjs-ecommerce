import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentsService } from '../payments.service';

@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    await this.paymentsService.handleWebhook(
      PaymentProvider.STRIPE,
      req.rawBody ?? Buffer.alloc(0),
      req.headers,
    );
    return { received: true };
  }

  @Public()
  @Post('klarna')
  @HttpCode(HttpStatus.OK)
  async klarna(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    await this.paymentsService.handleWebhook(
      PaymentProvider.KLARNA,
      req.rawBody ?? Buffer.alloc(0),
      req.headers,
    );
    return { received: true };
  }
}
