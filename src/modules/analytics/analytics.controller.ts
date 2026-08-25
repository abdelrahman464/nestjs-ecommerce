import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { DeadStockQueryDto } from './dto/dead-stock-query.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import {
  AnalyticsSummary,
  AovAnalytics,
  CatalogRevenueRow,
  CustomerSegments,
  LowStockRow,
  OrdersByDayPoint,
  PaymentFunnel,
  RefundAnalytics,
  ReservationHealth,
  RevenueBySource,
  TopCustomerRow,
  TopProductRow,
  VariantSalesRow,
  WarehouseLoadRow,
} from './types/analytics.types';

/**
 * Admin / manager dashboard API.
 *
 * Base path: /api/v1/analytics/...
 *
 * Analytics = business KPIs (this controller).
 * Audit log = security trail (GET /auditLogs) — different product.
 * Observability (Pino/OTel) = system health — not implemented here.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ── MVP ──────────────────────────────────────────────────────────

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  summary(@Query() query: AnalyticsRangeQueryDto): Promise<AnalyticsSummary> {
    return this.analyticsService.getSummary(query);
  }

  @Get('ordersByDay')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  ordersByDay(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<OrdersByDayPoint[]> {
    return this.analyticsService.getOrdersByDay(query);
  }

  /** Best-selling products; each row includes that product's selling variants. */
  @Get('topProducts')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  topProducts(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<TopProductRow[]> {
    return this.analyticsService.getTopProducts(query);
  }

  @Get('lowStock')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  lowStock(
    @Query() query: LowStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.analyticsService.getLowStock(query);
  }

  // ── 1–13 insights ────────────────────────────────────────────────

  /** 1) pending/paid/failed/expired/cancelled (+ by provider). */
  @Get('paymentFunnel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  paymentFunnel(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<PaymentFunnel> {
    return this.analyticsService.getPaymentFunnel(query);
  }

  /** 2) Refund rate + top refund reasons. */
  @Get('refunds')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  refunds(@Query() query: AnalyticsRangeQueryDto): Promise<RefundAnalytics> {
    return this.analyticsService.getRefunds(query);
  }

  /** 3) Revenue by order.source and by payment.provider. */
  @Get('revenueBySource')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  revenueBySource(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<RevenueBySource> {
    return this.analyticsService.getRevenueBySource(query);
  }

  /** 4) Average order value (gross / paid count) per currency. */
  @Get('aov')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  aov(@Query() query: AnalyticsRangeQueryDto): Promise<AovAnalytics> {
    return this.analyticsService.getAov(query);
  }

  /** 5) Reservation health — split by source (checkout vs manual_order). */
  @Get('reservationHealth')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  reservationHealth(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<ReservationHealth> {
    return this.analyticsService.getReservationHealth(query);
  }

  /** 6) available === 0 (paginated, lean joins). */
  @Get('stockouts')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  stockouts(
    @Query() query: LowStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.analyticsService.getStockouts(query);
  }

  /** 7) On-hand with zero paid sales in last N days. */
  @Get('deadStock')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deadStock(
    @Query() query: DeadStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.analyticsService.getDeadStock(query);
  }

  /** 8) Units / reserved / available per warehouse. */
  @Get('warehouseLoad')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  warehouseLoad(): Promise<WarehouseLoadRow[]> {
    return this.analyticsService.getWarehouseLoad();
  }

  /** 10) Least-selling SKUs that still had sales in the window. */
  @Get('slowMovers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  slowMovers(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<VariantSalesRow[]> {
    return this.analyticsService.getSlowMovers(query);
  }

  /** 11a) Revenue rolled up by category. */
  @Get('revenueByCategory')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  revenueByCategory(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<CatalogRevenueRow[]> {
    return this.analyticsService.getRevenueByCategory(query);
  }

  /** 11b) Revenue rolled up by brand. */
  @Get('revenueByBrand')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  revenueByBrand(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<CatalogRevenueRow[]> {
    return this.analyticsService.getRevenueByBrand(query);
  }

  /** 12) New vs returning buyers in the window. */
  @Get('customerSegments')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  customerSegments(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<CustomerSegments> {
    return this.analyticsService.getCustomerSegments(query);
  }

  /**
   * 13) Highest-spend customers (includes email — admin CRM use).
   * Prefer ADMIN-only in production if managers should not see PII.
   */
  @Get('topCustomers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  topCustomers(
    @Query() query: AnalyticsRangeQueryDto,
  ): Promise<TopCustomerRow[]> {
    return this.analyticsService.getTopCustomers(query);
  }
}
