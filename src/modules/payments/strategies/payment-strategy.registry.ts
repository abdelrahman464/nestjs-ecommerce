import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { I18nHttpException } from '../../../common/filters/i18n-http.exception';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { IPaymentStrategy } from '../interfaces/payment-strategy.interface';

@Injectable()
export class PaymentStrategyRegistry {
  private readonly logger = new Logger(PaymentStrategyRegistry.name);
  private readonly strategies = new Map<PaymentProvider, IPaymentStrategy>();

  register(strategy: IPaymentStrategy): void {
    this.strategies.set(strategy.provider, strategy);
    this.logger.log(`Payment strategy '${strategy.provider}' registered`);
  }

  get(provider: PaymentProvider): IPaymentStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'payment.providerNotSupported',
        { provider },
      );
    }
    return strategy;
  }

  has(provider: PaymentProvider): boolean {
    return this.strategies.has(provider);
  }
}
