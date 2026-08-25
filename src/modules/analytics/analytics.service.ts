import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { DeadStockQueryDto } from './dto/dead-stock-query.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { AnalyticsInsightsRepository } from './repository/analytics-insights.repository';
import { AnalyticsRepository } from './repository/analytics.repository';
import {
  AnalyticsDateWindow,
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
 * Thin orchestration layer:
 * 1) validate / normalize query strings into typed Dates
 * 2) call the repository aggregates
 * 3) return shapes the admin UI can chart directly
 *
 * No writes. No audit here — reading KPIs is not a sensitive mutation.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly insightsRepository: AnalyticsInsightsRepository,
  ) {}

  // ── MVP ──────────────────────────────────────────────────────────

  async getSummary(query: AnalyticsRangeQueryDto): Promise<AnalyticsSummary> {
    return this.analyticsRepository.getSummary(this.toWindow(query));
  }

  async getOrdersByDay(
    query: AnalyticsRangeQueryDto,
  ): Promise<OrdersByDayPoint[]> {
    return this.analyticsRepository.getOrdersByDay(this.toWindow(query));
  }

  async getTopProducts(query: AnalyticsRangeQueryDto): Promise<TopProductRow[]> {
    return this.analyticsRepository.getTopProducts(
      this.toWindow(query),
      query.limit ?? 10,
    );
  }

  async getLowStock(
    query: LowStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.analyticsRepository.getLowStock({
      threshold: query.threshold ?? 5,
      warehouseId: query.warehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  // ── Insights (the 13) ────────────────────────────────────────────

  /** 1 */ getPaymentFunnel(query: AnalyticsRangeQueryDto): Promise<PaymentFunnel> {
    return this.insightsRepository.getPaymentFunnel(this.toWindow(query));
  }

  /** 2 */ getRefunds(query: AnalyticsRangeQueryDto): Promise<RefundAnalytics> {
    return this.insightsRepository.getRefunds(this.toWindow(query));
  }

  /** 3 */ getRevenueBySource(
    query: AnalyticsRangeQueryDto,
  ): Promise<RevenueBySource> {
    return this.insightsRepository.getRevenueBySource(this.toWindow(query));
  }

  /** 4 */ getAov(query: AnalyticsRangeQueryDto): Promise<AovAnalytics> {
    return this.insightsRepository.getAov(this.toWindow(query));
  }

  /** 5 */ getReservationHealth(
    query: AnalyticsRangeQueryDto,
  ): Promise<ReservationHealth> {
    return this.insightsRepository.getReservationHealth(this.toWindow(query));
  }

  /** 6 — stockouts = lowStock with available <= 0 */
  getStockouts(
    query: LowStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.analyticsRepository.getLowStock({
      threshold: 0,
      warehouseId: query.warehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  /** 7 */ getDeadStock(
    query: DeadStockQueryDto,
  ): Promise<PaginatedResponseDto<LowStockRow>> {
    return this.insightsRepository.getDeadStock({
      days: query.days ?? 30,
      warehouseId: query.warehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  /** 8 */ getWarehouseLoad(): Promise<WarehouseLoadRow[]> {
    return this.insightsRepository.getWarehouseLoad();
  }

  /** 10 */ getSlowMovers(
    query: AnalyticsRangeQueryDto,
  ): Promise<VariantSalesRow[]> {
    return this.insightsRepository.getVariantSales(
      this.toWindow(query),
      query.limit ?? 10,
      'slow',
    );
  }

  /** 11a */ getRevenueByCategory(
    query: AnalyticsRangeQueryDto,
  ): Promise<CatalogRevenueRow[]> {
    return this.insightsRepository.getCatalogRevenue(
      this.toWindow(query),
      'category',
      query.limit ?? 20,
    );
  }

  /** 11b */ getRevenueByBrand(
    query: AnalyticsRangeQueryDto,
  ): Promise<CatalogRevenueRow[]> {
    return this.insightsRepository.getCatalogRevenue(
      this.toWindow(query),
      'brand',
      query.limit ?? 20,
    );
  }

  /** 12 */ getCustomerSegments(
    query: AnalyticsRangeQueryDto,
  ): Promise<CustomerSegments> {
    return this.insightsRepository.getCustomerSegments(this.toWindow(query));
  }

  /** 13 */ getTopCustomers(
    query: AnalyticsRangeQueryDto,
  ): Promise<TopCustomerRow[]> {
    return this.insightsRepository.getTopCustomers(
      this.toWindow(query),
      query.limit ?? 20,
    );
  }

  /**
   * Turn optional ISO strings into a Date window.
   * End-of-day: if `to` is date-only (`YYYY-MM-DD`), include the whole day
   * by setting time to 23:59:59.999 UTC so that day's orders are not cut off.
   */
  private toWindow(query: AnalyticsRangeQueryDto): AnalyticsDateWindow {
    const from = query.from ? this.parseBound(query.from, 'from') : undefined;
    let to = query.to ? this.parseBound(query.to, 'to') : undefined;

    if (to && /^\d{4}-\d{2}-\d{2}$/.test(query.to!)) {
      to = new Date(to);
      to.setUTCHours(23, 59, 59, 999);
    }

    if (from && to && from.getTime() > to.getTime()) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'analytics.invalidDateRange',
      );
    }

    return {
      from,
      to,
      currency: query.currency?.toUpperCase(),
    };
  }

  private parseBound(value: string, label: 'from' | 'to'): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'analytics.invalidDate',
        { field: label },
      );
    }
    return date;
  }
}
