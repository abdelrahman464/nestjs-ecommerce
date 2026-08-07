import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentRepository } from './repository/payment.repository';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { KlarnaStrategy } from './strategies/klarna.strategy';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';
import { StripeStrategy } from './strategies/stripe.strategy';
import { PaymentsWebhookController } from './webhooks/payments-webhook.controller';

@Module({
  imports: [
    ConfigModule,
    CartModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Product.name, schema: ProductSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    PaymentRepository,
    PaymentStrategyRegistry,
    StripeStrategy,
    KlarnaStrategy,
  ],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly registry: PaymentStrategyRegistry,
    private readonly stripeStrategy: StripeStrategy,
    private readonly klarnaStrategy: KlarnaStrategy,
  ) {}

  onModuleInit() {
    this.registry.register(this.stripeStrategy);
    this.registry.register(this.klarnaStrategy);
  }
}
