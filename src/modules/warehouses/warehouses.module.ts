import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InventoryLevel,
  InventoryLevelSchema,
} from '../inventory/schemas/inventory-level.schema';
import { WarehousesController } from './warehouses.controller';
import { WarehousesRepository } from './repository/warehouses.repository';
import { Warehouse, WarehouseSchema } from './schemas/warehouse.schema';
import { WarehousesService } from './warehouses.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Warehouse.name, schema: WarehouseSchema },
      // Registered here only so soft-delete can check levels without importing InventoryModule.
      { name: InventoryLevel.name, schema: InventoryLevelSchema },
    ]),
  ],
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehousesRepository],
  exports: [WarehousesService],
})
export class WarehousesModule {}
