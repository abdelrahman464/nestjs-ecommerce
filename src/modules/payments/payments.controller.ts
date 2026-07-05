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
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CheckoutResponse, PaymentsService } from './payments.service';
import { PaymentDocument } from './schemas/payment.schema';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout/resume')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTRUCTOR)
  @HttpCode(HttpStatus.OK)
  async resumeCheckout(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<CheckoutResponse> {
    return this.paymentsService.resumeCheckout(authUser.id);
  }

  @Post('checkout/cancel')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTRUCTOR)
  @HttpCode(HttpStatus.OK)
  async cancelPendingCheckout(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    return this.paymentsService.cancelPendingCheckout(authUser.id);
  }

  @Post('checkout')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTRUCTOR)
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Body() dto: CreateCheckoutDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<CheckoutResponse> {
    return this.paymentsService.createCheckout(authUser.id, dto);
  }

  @Get('my')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER, UserRole.INSTRUCTOR)
  async findMine(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentsService.getMyPayments(authUser.id, queryParams);
  }

  @Get('/')
  @Roles(UserRole.ADMIN)
  async findAllPayments(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentsService.findAllPayments(queryParams);
  }
  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findPaymentById(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<PaymentDocument> {
    return this.paymentsService.findPaymentById(id);
  }
}
