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
import { Throttle } from '@nestjs/throttler';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { MarkPaymentPaidDto } from './dto/mark-payment-paid.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { CheckoutResponse, PaymentsService } from './payments.service';
import { PaymentDocument } from './schemas/payment.schema';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';
import { THROTTLE } from '../../config/throttler.config';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout/resume')
  @Throttle(THROTTLE.CHECKOUT)
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async resumeCheckout(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<CheckoutResponse> {
    return this.paymentsService.resumeCheckout(authUser.id);
  }

  @Post('checkout/cancel')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async cancelPendingCheckout(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    return this.paymentsService.cancelPendingCheckout(authUser.id);
  }

  @Post('checkout')
  // Caps Stripe/Klarna session creation — a retry storm is a card-machine jammed on "pay".
  @Throttle(THROTTLE.CHECKOUT)
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Body() dto: CreateCheckoutDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<CheckoutResponse> {
    return this.paymentsService.createCheckout(authUser.id, dto);
  }

  @Post(':id/markPaid')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async markPaid(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: MarkPaymentPaidDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<PaymentDocument> {
    return this.paymentsService.markPaid(id, dto, authUser.id);
  }

  @Post(':id/refund')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async refund(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: RefundPaymentDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<PaymentDocument> {
    return this.paymentsService.refund(id, dto, authUser.id);
  }

  @Get('my')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  async findMine(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentsService.getMyPayments(authUser.id, queryParams);
  }

  @Get('/')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findAllPayments(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<PaymentDocument>> {
    return this.paymentsService.findAllPayments(queryParams);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findPaymentById(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<PaymentDocument> {
    return this.paymentsService.findPaymentById(id);
  }
}
