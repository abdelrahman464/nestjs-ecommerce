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
import {
  InventoryLevel,
  InventoryLevelSchema,
} from './schemas/inventory-level.schema';
import {
  InventoryMovement,
  InventoryMovementSchema,
} from './schemas/inventory-movement.schema';

@Module({
  imports: [
    WarehousesModule,
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      { name: InventoryLevel.name, schema: InventoryLevelSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    InventoryLevelsRepository,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
