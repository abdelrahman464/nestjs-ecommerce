import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { CreateInventoryTransferDto } from './dto/create-inventory-transfer.dto';
import { InventoryService } from './inventory.service';
import {
  ReservationsService,
  VariantAvailability,
} from './reservations.service';
import { InventoryLevelDocument } from './schemas/inventory-level.schema';
import { InventoryMovementDocument } from './schemas/inventory-movement.schema';
import { InventoryReservationDocument } from './schemas/inventory-reservation.schema';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reservationsService: ReservationsService,
  ) {}

  @Post('movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async postMovement(
    @Body() dto: CreateInventoryMovementDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<InventoryMovementDocument> {
    return this.inventoryService.postManualMovement(dto, authUser.id);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @Body() dto: CreateInventoryTransferDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<{ out: InventoryMovementDocument; in: InventoryMovementDocument }> {
    return this.inventoryService.transfer(dto, authUser.id);
  }

  @Get('movements/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<InventoryMovementDocument> {
    return this.inventoryService.findOne(id);
  }

  @Get('variants/:variantId/movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findByVariant(
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    return this.inventoryService.findByVariant(variantId, queryParams);
  }

  @Get('products/:productId/movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findByProduct(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    return this.inventoryService.findByProduct(productId, queryParams);
  }

  @Get('warehouses/:warehouseId/movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findMovementsByWarehouse(
    @Param('warehouseId', ParseObjectIdPipe) warehouseId: Types.ObjectId,
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    return this.inventoryService.findMovementsByWarehouse(
      warehouseId,
      queryParams,
    );
  }

  @Get('variants/:variantId/levels')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findLevelsByVariant(
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<{ data: InventoryLevelDocument[]; totalStock: number }> {
    return this.inventoryService.findLevelsByVariant(variantId);
  }

  @Get('warehouses/:warehouseId/levels')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findLevelsByWarehouse(
    @Param('warehouseId', ParseObjectIdPipe) warehouseId: Types.ObjectId,
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryLevelDocument>> {
    return this.inventoryService.findLevelsByWarehouse(
      warehouseId,
      queryParams,
    );
  }

  @Get('variants/:variantId/availability')
  @Roles(
    UserRole.USER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  )
  async getAvailability(
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<VariantAvailability> {
    return this.reservationsService.getAvailability(variantId.toString());
  }

  @Get('orders/:orderId/reservation')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findReservationByOrder(
    @Param('orderId', ParseObjectIdPipe) orderId: Types.ObjectId,
  ): Promise<InventoryReservationDocument> {
    return this.reservationsService.findByOrderId(orderId);
  }

  @Get('reservations/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findReservation(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<InventoryReservationDocument> {
    return this.reservationsService.findById(id);
  }

  @Post('reservations/:id/release')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async releaseReservation(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<InventoryReservationDocument> {
    return this.reservationsService.releaseById(id);
  }
}
