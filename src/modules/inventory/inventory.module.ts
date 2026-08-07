import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../products/schemas/product-variant.schema';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryLevelsRepository } from './repository/inventory-levels.repository';
import { InventoryRepository } from './repository/inventory.repository';
import { ReservationsRepository } from './repository/reservations.repository';
import { ReservationsService } from './reservations.service';
import {
  InventoryLevel,
  InventoryLevelSchema,
} from './schemas/inventory-level.schema';
import {
  InventoryMovement,
  InventoryMovementSchema,
} from './schemas/inventory-movement.schema';
import {
  InventoryReservation,
  InventoryReservationSchema,
} from './schemas/inventory-reservation.schema';

@Module({
  imports: [
    WarehousesModule,
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      { name: InventoryLevel.name, schema: InventoryLevelSchema },
      { name: InventoryReservation.name, schema: InventoryReservationSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    InventoryLevelsRepository,
    ReservationsService,
    ReservationsRepository,
  ],
  exports: [InventoryService, ReservationsService],
})
export class InventoryModule {}
