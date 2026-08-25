import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  resolveRequestContentLocale,
} from '../../../common/constants/supported-content-locales.constant';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import {
  InventoryLevel,
  InventoryLevelDocument,
} from '../../inventory/schemas/inventory-level.schema';
import { Order, OrderDocument } from '../../orders/schemas/order.schema';
import { OrderStatus } from '../../orders/enums/order.enums';
import {
  Payment,
  PaymentDocument,
} from '../../payments/schemas/payment.schema';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import {
  AnalyticsDateWindow,
  AnalyticsSummary,
  LowStockRow,
  MoneyBucket,
  OrdersByDayPoint,
  OrderStatusBucket,
  TopProductRow,
} from '../types/analytics.types';
import { roundMoney } from '../utils/round-money.util';

export type { AnalyticsDateWindow };

/**
 * All Mongo `$aggregate` pipelines for the admin analytics dashboard.
 *
 * Why aggregates here (not in OrdersService / PaymentsService)?
 * - List/CRUD services stay simple (find + page).
 * - Dashboard queries are a different access pattern: group / sum / unwind.
 * - Keeps indexes and `$match` choices documented in one place.
 *
 * Mental model:
 *   Audit log  → “who did what?” (security trail, append-only writes)
 *   Analytics  → “how is the business doing?” (read-only KPIs over orders/payments/stock)
 */
@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(InventoryLevel.name)
    private readonly levelModel: Model<InventoryLevelDocument>,
  ) {}

  /**
   * KPI card data for a date window.
   *
   * Two different clocks on purpose:
   * - Orders → `createdAt` (when the order was opened)
   * - Money  → `paidAt` / `refundedAt` (when cash moved)
   *
   * Example: order created Jan 31, paid Feb 1 → counts in Jan for ordersByStatus,
   * but revenue lands in February. That matches how finance usually thinks.
   */
  async getSummary(window: AnalyticsDateWindow): Promise<AnalyticsSummary> {
    const ordersByStatus = await this.aggregateOrdersByStatus(window);
    const money = await this.aggregateMoney(window);

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      ordersByStatus,
      money,
    };
  }

  /** Line chart: paid orders per UTC day (order.createdAt) + revenue. */
  async getOrdersByDay(
    window: AnalyticsDateWindow,
  ): Promise<OrdersByDayPoint[]> {
    const match: Record<string, unknown> = {
      // Only successful commerce — pending/cancelled would distort the chart.
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) {
      match.currency = window.currency.toUpperCase();
    }

    const rows = await this.orderModel
      .aggregate<{
        _id: { day: string; currency: string };
        orderCount: number;
        revenue: number;
      }>([
        { $match: match },
        {
          // Bucket by UTC calendar day so every timezone sees the same series.
          // Format: "2026-01-15"
          $group: {
            _id: {
              day: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              currency: '$currency',
            },
            orderCount: { $sum: 1 },
            revenue: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.day': 1, '_id.currency': 1 } },
      ])
      .exec();

    return rows.map((r) => ({
      date: r._id.day,
      currency: r._id.currency,
      orderCount: r.orderCount,
      revenue: r.revenue,
    }));
  }

  /**
   * Best-selling products from paid order lines, each with its selling variants.
   *
   * Pipeline: unwind lines → group by variant → lookup SKU → roll up by product
   * → sort/limit products. Variant rank is applied in memory on the page.
   */
  async getTopProducts(
    window: AnalyticsDateWindow,
    limit: number,
  ): Promise<TopProductRow[]> {
    const match: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) {
      match.currency = window.currency.toUpperCase();
    }

    const rows = await this.orderModel
      .aggregate<{
        _id: { product: Types.ObjectId; currency: string; productName: string };
        unitsSold: number;
        revenue: number;
        variants: Array<{
          variantId: Types.ObjectId;
          sku: string | null;
          unitsSold: number;
          revenue: number;
        }>;
      }>([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              product: '$items.product',
              variant: '$items.variant',
              productName: '$items.productName',
              currency: '$currency',
            },
            unitsSold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] },
            },
          },
        },
        {
          $lookup: {
            from: 'product_variants',
            let: { variantId: '$_id.variant' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$variantId'] } } },
              { $project: { sku: 1 } },
            ],
            as: '_v',
          },
        },
        {
          $group: {
            _id: {
              product: '$_id.product',
              productName: '$_id.productName',
              currency: '$_id.currency',
            },
            unitsSold: { $sum: '$unitsSold' },
            revenue: { $sum: '$revenue' },
            variants: {
              $push: {
                variantId: '$_id.variant',
                sku: { $ifNull: [{ $arrayElemAt: ['$_v.sku', 0] }, null] },
                unitsSold: '$unitsSold',
                revenue: '$revenue',
              },
            },
          },
        },
        { $sort: { unitsSold: -1, revenue: -1 } },
        { $limit: limit },
      ])
      .exec();

    return rows.map((r) => ({
      productId: r._id.product.toString(),
      productName: r._id.productName,
      currency: r._id.currency,
      unitsSold: r.unitsSold,
      revenue: roundMoney(r.revenue),
      variants: [...r.variants]
        .sort(
          (a, b) =>
            b.unitsSold - a.unitsSold || b.revenue - a.revenue,
        )
        .map((v) => ({
          variantId: v.variantId.toString(),
          sku: v.sku,
          unitsSold: v.unitsSold,
          revenue: roundMoney(v.revenue),
        })),
    }));
  }

  /**
   * Snapshot: variant×warehouse rows where available stock is at or below threshold.
   *
   * Performance order matters:
   * 1) filter + sort on inventory_levels only
   * 2) $facet → count total + $skip/$limit for the page
   * 3) $lookup ONLY on the page rows, projecting sku/title/code (not full docs)
   *
   * Joining before pagination would pull product/warehouse data for every
   * low-stock row in the DB — expensive and unused for other pages.
   */
  async getLowStock(params: {
    threshold: number;
    warehouseId?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponseDto<LowStockRow>> {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = {};
    if (params.warehouseId && Types.ObjectId.isValid(params.warehouseId)) {
      match.warehouse = new Types.ObjectId(params.warehouseId);
    }

    // Request language for product.title (e.g. de → title.de, else title.en).
    const locale = resolveRequestContentLocale();
    const titlePath = `$title.${locale}`;
    const titleFallback = `$title.${DEFAULT_CONTENT_LOCALE}`;

    const pipeline: PipelineStage[] = [
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $addFields: {
          quantity: { $ifNull: ['$quantity', 0] },
          reservedQuantity: { $ifNull: ['$reservedQuantity', 0] },
          available: {
            $subtract: [
              { $ifNull: ['$quantity', 0] },
              { $ifNull: ['$reservedQuantity', 0] },
            ],
          },
        },
      },
      {
        $match: {
          available: { $lte: params.threshold },
        },
      },
      {
        $lookup: {
          from: 'product_variants',
          let: { variantId: '$variant' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$variantId'] },
                deletedAt: null,
              },
            },
            { $project: { _id: 1, sku: 1, barcode: 1 } },
          ],
          as: '_variant',
        },
      },
      {
        $lookup: {
          from: 'products',
          let: { productId: '$product' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$productId'] },
                deletedAt: null,
              },
            },
            {
              $project: {
                _id: 1,
                slug: 1,
                title: { $ifNull: [titlePath, titleFallback] },
              },
            },
          ],
          as: '_product',
        },
      },
      { $match: { _variant: { $ne: [] }, _product: { $ne: [] } } },
      { $sort: { available: 1, quantity: 1 } },
      {
        $facet: {
          meta: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'warehouses',
                let: { warehouseId: '$warehouse' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$_id', '$$warehouseId'] },
                      deletedAt: null,
                    },
                  },
                  { $project: { _id: 1, name: 1, code: 1 } },
                ],
                as: '_warehouse',
              },
            },
            {
              $project: {
                _id: 0,
                quantity: 1,
                reservedQuantity: 1,
                available: 1,
                variant: {
                  $let: {
                    vars: { v: { $arrayElemAt: ['$_variant', 0] } },
                    in: {
                      id: { $toString: '$$v._id' },
                      sku: '$$v.sku',
                      barcode: '$$v.barcode',
                    },
                  },
                },
                product: {
                  $let: {
                    vars: { p: { $arrayElemAt: ['$_product', 0] } },
                    in: {
                      id: { $toString: '$$p._id' },
                      title: '$$p.title',
                      slug: '$$p.slug',
                    },
                  },
                },
                warehouse: {
                  $let: {
                    vars: { w: { $arrayElemAt: ['$_warehouse', 0] } },
                    in: {
                      $cond: [
                        { $eq: ['$$w', null] },
                        null,
                        {
                          id: { $toString: '$$w._id' },
                          name: '$$w.name',
                          code: '$$w.code',
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const [facet] = await this.levelModel
      .aggregate<{
        meta: Array<{ total: number }>;
        data: LowStockRow[];
      }>(pipeline)
      .exec();

    const total = facet?.meta[0]?.total ?? 0;
    return {
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      data: facet?.data ?? [],
    };
  }

  // ── private helpers ──────────────────────────────────────────────

  private async aggregateOrdersByStatus(
    window: AnalyticsDateWindow,
  ): Promise<OrderStatusBucket[]> {
    const match: Record<string, unknown> = {
      ...this.createdAtMatch(window),
    };
    if (window.currency) {
      match.currency = window.currency.toUpperCase();
    }

    const rows = await this.orderModel
      .aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return rows.map((r) => ({ status: r._id, count: r.count }));
  }

  /**
   * Revenue uses the payments collection (source of truth for money movement).
   * `$facet` runs paid + refunded branches in one round-trip.
   */
  private async aggregateMoney(
    window: AnalyticsDateWindow,
  ): Promise<MoneyBucket[]> {
    const currencyFilter = window.currency
      ? { currency: window.currency.toUpperCase() }
      : {};

    const paidMatch: Record<string, unknown> = {
      status: PaymentStatus.PAID,
      ...currencyFilter,
      ...this.dateFieldMatch('paidAt', window),
    };
    const refundedMatch: Record<string, unknown> = {
      status: PaymentStatus.REFUNDED,
      ...currencyFilter,
      ...this.dateFieldMatch('refundedAt', window),
    };

    const [facet] = await this.paymentModel
      .aggregate<{
        paid: Array<{
          _id: string;
          grossRevenue: number;
          paidCount: number;
        }>;
        refunded: Array<{
          _id: string;
          refundedAmount: number;
          refundedCount: number;
        }>;
      }>([
        {
          $facet: {
            paid: [
              { $match: paidMatch },
              {
                $group: {
                  _id: '$currency',
                  grossRevenue: { $sum: '$amount' },
                  paidCount: { $sum: 1 },
                },
              },
            ],
            refunded: [
              { $match: refundedMatch },
              {
                $group: {
                  _id: '$currency',
                  refundedAmount: { $sum: '$amount' },
                  refundedCount: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .exec();

    // Merge paid + refunded maps by currency so the UI gets one row per currency.
    const byCurrency = new Map<string, MoneyBucket>();

    for (const row of facet?.paid ?? []) {
      byCurrency.set(row._id, {
        currency: row._id,
        grossRevenue: roundMoney(row.grossRevenue),
        refundedAmount: 0,
        paidCount: row.paidCount,
        refundedCount: 0,
      });
    }

    for (const row of facet?.refunded ?? []) {
      const existing = byCurrency.get(row._id) ?? {
        currency: row._id,
        grossRevenue: 0,
        refundedAmount: 0,
        paidCount: 0,
        refundedCount: 0,
      };
      existing.refundedAmount = roundMoney(row.refundedAmount);
      existing.refundedCount = row.refundedCount;
      byCurrency.set(row._id, existing);
    }

    return [...byCurrency.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );
  }

  /** Build `{ createdAt: { $gte, $lte } }` only for fields that were provided. */
  private createdAtMatch(
    window: AnalyticsDateWindow,
  ): Record<string, unknown> {
    return this.dateFieldMatch('createdAt', window);
  }

  private dateFieldMatch(
    field: string,
    window: AnalyticsDateWindow,
  ): Record<string, unknown> {
    if (!window.from && !window.to) return {};
    const range: Record<string, Date> = {};
    if (window.from) range.$gte = window.from;
    if (window.to) range.$lte = window.to;
    return { [field]: range };
  }
}
