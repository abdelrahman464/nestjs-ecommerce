import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InventoryLevel,
  InventoryLevelSchema,
} from '../inventory/schemas/inventory-level.schema';
import {
  InventoryReservation,
  InventoryReservationSchema,
} from '../inventory/schemas/inventory-reservation.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsInsightsRepository } from './repository/analytics-insights.repository';
import { AnalyticsRepository } from './repository/analytics.repository';

/**
 * Read-only analytics over existing commerce collections.
 * Not @Global() — nothing else needs to inject AnalyticsService for writes.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: InventoryLevel.name, schema: InventoryLevelSchema },
      { name: InventoryReservation.name, schema: InventoryReservationSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsRepository,
    AnalyticsInsightsRepository,
  ],
})
export class AnalyticsModule {}
