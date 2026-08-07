import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryModule } from '../inventory/inventory.module';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { ProductsModule } from '../products/products.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { OrdersFacadeService } from './orders-facade.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './repository/orders.repository';
import { Order, OrderSchema } from './schemas/order.schema';

@Module({
  imports: [
    ConfigModule,
    ProductsModule,
    InventoryModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersFacadeService],
  exports: [OrdersService],
})
export class OrdersModule {}
