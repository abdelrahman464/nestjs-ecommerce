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
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { OrdersFacadeService } from './orders-facade.service';
import { OrdersService } from './orders.service';
import { OrderDocument } from './schemas/order.schema';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersFacade: OrdersFacadeService,
  ) {}

  @Post('manual')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async createManual(
    @Body() dto: CreateManualOrderDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ) {
    return this.ordersFacade.createManualOrder(authUser.id, dto);
  }

  @Get('my')
  @Roles(
    UserRole.USER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  )
  async findMine(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    return this.ordersService.findMine(authUser.id, queryParams);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findAll(
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<OrderDocument>> {
    return this.ordersService.findAll(queryParams);
  }

  @Get(':id')
  @Roles(
    UserRole.USER,
    UserRole.ADMIN,
    UserRole.MANAGER,
  )
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const isStaff =
      authUser.role === UserRole.ADMIN || authUser.role === UserRole.MANAGER;
    return this.ordersService.findOne(id, { id: authUser.id, isStaff });
  }
}
