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
import { InventoryService } from './inventory.service';
import { InventoryMovementDocument } from './schemas/inventory-movement.schema';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async postMovement(
    @Body() dto: CreateInventoryMovementDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<InventoryMovementDocument> {
    return this.inventoryService.postManualMovement(dto, authUser.id);
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
}
