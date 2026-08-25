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
import {
  InventoryReservation,
  InventoryReservationDocument,
} from '../../inventory/schemas/inventory-reservation.schema';
import {
  ReservationSource,
  ReservationStatus,
} from '../../inventory/enums/reservation.enums';
import { Order, OrderDocument } from '../../orders/schemas/order.schema';
import { OrderStatus } from '../../orders/enums/order.enums';
import {
  Payment,
  PaymentDocument,
} from '../../payments/schemas/payment.schema';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import {
  AnalyticsDateWindow,
  AovAnalytics,
  CatalogRevenueRow,
  CustomerSegments,
  LowStockRow,
  PaymentFunnel,
  RefundAnalytics,
  ReservationHealth,
  RevenueBySource,
  TopCustomerRow,
  VariantSalesRow,
  WarehouseLoadRow,
} from '../types/analytics.types';
import { formatDurationMs } from '../utils/format-duration.util';
import { roundMoney, roundRate } from '../utils/round-money.util';

/**
 * Extra dashboard aggregates (payment funnel, merchandising, customers, …).
 * Kept separate from the MVP repository so each file stays readable.
 *
 * Still read-only — never writes audit rows (that is AuditLogService).
 */
@Injectable()
export class AnalyticsInsightsRepository {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(InventoryLevel.name)
    private readonly levelModel: Model<InventoryLevelDocument>,
    @InjectModel(InventoryReservation.name)
    private readonly reservationModel: Model<InventoryReservationDocument>,
  ) {}

  // ── 1) Payment funnel ────────────────────────────────────────────

  async getPaymentFunnel(window: AnalyticsDateWindow): Promise<PaymentFunnel> {
    const match: Record<string, unknown> = {
      ...this.createdAtMatch(window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    const [facet] = await this.paymentModel
      .aggregate<{
        byStatus: Array<{ _id: string; count: number; amount: number }>;
        byProviderStatus: Array<{
          _id: { provider: string; status: string };
          count: number;
          amount: number;
        }>;
      }>([
        { $match: match },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  amount: { $sum: '$amount' },
                },
              },
              { $sort: { _id: 1 } },
            ],
            byProviderStatus: [
              {
                $group: {
                  _id: { provider: '$provider', status: '$status' },
                  count: { $sum: 1 },
                  amount: { $sum: '$amount' },
                },
              },
              { $sort: { '_id.provider': 1, '_id.status': 1 } },
            ],
          },
        },
      ])
      .exec();

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      byStatus: (facet?.byStatus ?? []).map((r) => ({
        status: r._id,
        count: r.count,
        amount: r.amount,
      })),
      byProviderStatus: (facet?.byProviderStatus ?? []).map((r) => ({
        provider: r._id.provider,
        status: r._id.status,
        count: r.count,
        amount: r.amount,
      })),
    };
  }

  // ── 2) Refunds ───────────────────────────────────────────────────

  async getRefunds(window: AnalyticsDateWindow): Promise<RefundAnalytics> {
    const currencyFilter = window.currency
      ? { currency: window.currency.toUpperCase() }
      : {};

    const paidMatch = {
      status: PaymentStatus.PAID,
      ...currencyFilter,
      ...this.dateFieldMatch('paidAt', window),
    };
    const refundedMatch = {
      status: PaymentStatus.REFUNDED,
      ...currencyFilter,
      ...this.dateFieldMatch('refundedAt', window),
    };

    const [facet] = await this.paymentModel
      .aggregate<{
        paid: Array<{ _id: string; grossRevenue: number }>;
        refunded: Array<{
          _id: string;
          refundedAmount: number;
          refundedCount: number;
        }>;
        reasons: Array<{ _id: string; count: number; amount: number }>;
      }>([
        {
          $facet: {
            paid: [
              { $match: paidMatch },
              {
                $group: {
                  _id: '$currency',
                  grossRevenue: { $sum: '$amount' },
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
            reasons: [
              { $match: refundedMatch },
              {
                $group: {
                  _id: {
                    $ifNull: [
                      { $trim: { input: { $ifNull: ['$refundReason', ''] } } },
                      '',
                    ],
                  },
                  count: { $sum: 1 },
                  amount: { $sum: '$amount' },
                },
              },
              {
                $addFields: {
                  _id: {
                    $cond: [
                      { $or: [{ $eq: ['$_id', ''] }, { $eq: ['$_id', null] }] },
                      '(no reason)',
                      '$_id',
                    ],
                  },
                },
              },
              { $sort: { count: -1, amount: -1 } },
              { $limit: 20 },
            ],
          },
        },
      ])
      .exec();

    const byCurrencyMap = new Map<
      string,
      {
        currency: string;
        grossRevenue: number;
        refundedAmount: number;
        refundRate: number;
        refundedCount: number;
      }
    >();

    for (const row of facet?.paid ?? []) {
      byCurrencyMap.set(row._id, {
        currency: row._id,
        grossRevenue: roundMoney(row.grossRevenue),
        refundedAmount: 0,
        refundRate: 0,
        refundedCount: 0,
      });
    }
    for (const row of facet?.refunded ?? []) {
      const cur = byCurrencyMap.get(row._id) ?? {
        currency: row._id,
        grossRevenue: 0,
        refundedAmount: 0,
        refundRate: 0,
        refundedCount: 0,
      };
      cur.refundedAmount = roundMoney(row.refundedAmount);
      cur.refundedCount = row.refundedCount;
      // Refunded payments already left grossRevenue (status flipped paid → refunded).
      const captured = cur.grossRevenue + cur.refundedAmount;
      cur.refundRate =
        captured > 0 ? roundRate(cur.refundedAmount / captured) : 0;
      byCurrencyMap.set(row._id, cur);
    }

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      byCurrency: [...byCurrencyMap.values()].sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
      topReasons: (facet?.reasons ?? []).map((r) => ({
        reason: r._id,
        count: r.count,
        amount: r.amount,
      })),
    };
  }

  // ── 3) Revenue by source / provider ──────────────────────────────

  async getRevenueBySource(
    window: AnalyticsDateWindow,
  ): Promise<RevenueBySource> {
    const orderMatch: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) orderMatch.currency = window.currency.toUpperCase();

    const paymentMatch: Record<string, unknown> = {
      status: PaymentStatus.PAID,
      ...this.dateFieldMatch('paidAt', window),
    };
    if (window.currency) paymentMatch.currency = window.currency.toUpperCase();

    const bySource = await this.orderModel
      .aggregate<{
        _id: { source: string; currency: string };
        orderCount: number;
        revenue: number;
      }>([
        { $match: orderMatch },
        {
          $group: {
            _id: { source: '$source', currency: '$currency' },
            orderCount: { $sum: 1 },
            revenue: { $sum: '$amount' },
          },
        },
        { $sort: { revenue: -1 } },
      ])
      .exec();

    const byProvider = await this.paymentModel
      .aggregate<{
        _id: { provider: string; currency: string };
        paymentCount: number;
        revenue: number;
      }>([
        { $match: paymentMatch },
        {
          $group: {
            _id: { provider: '$provider', currency: '$currency' },
            paymentCount: { $sum: 1 },
            revenue: { $sum: '$amount' },
          },
        },
        { $sort: { revenue: -1 } },
      ])
      .exec();

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      bySource: bySource.map((r) => ({
        source: r._id.source,
        currency: r._id.currency,
        orderCount: r.orderCount,
        revenue: r.revenue,
      })),
      byProvider: byProvider.map((r) => ({
        provider: r._id.provider,
        currency: r._id.currency,
        paymentCount: r.paymentCount,
        revenue: r.revenue,
      })),
    };
  }

  // ── 4) AOV ───────────────────────────────────────────────────────

  async getAov(window: AnalyticsDateWindow): Promise<AovAnalytics> {
    const match: Record<string, unknown> = {
      status: PaymentStatus.PAID,
      ...this.dateFieldMatch('paidAt', window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    const rows = await this.paymentModel
      .aggregate<{
        _id: string;
        paidCount: number;
        grossRevenue: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: '$currency',
            paidCount: { $sum: 1 },
            grossRevenue: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      byCurrency: rows.map((r) => ({
        currency: r._id,
        paidCount: r.paidCount,
        grossRevenue: r.grossRevenue,
        aov:
          r.paidCount > 0
            ? Math.round((r.grossRevenue / r.paidCount) * 100) / 100
            : 0, 
      })),
    };
  }

  // ── 5) Reservation health ────────────────────────────────────────

  /**
   * Checkout holds (~30m) and manual_order holds (~48h) must never be
   * averaged together — that produced a fake “~1 day” expire average.
   * Everything timing-related is grouped by `source`.
   */
  async getReservationHealth(
    window: AnalyticsDateWindow,
  ): Promise<ReservationHealth> {
    const match = this.createdAtMatch(window);

    const [facet] = await this.reservationModel
      .aggregate<{
        byStatus: Array<{ _id: string; count: number }>;
        bySourceStatus: Array<{
          _id: { source: string; status: string };
          count: number;
        }>;
        confirmBySource: Array<{ _id: string; avgMs: number | null }>;
        expireBySource: Array<{ _id: string; avgMs: number | null }>;
      }>([
        { $match: match },
        {
          $facet: {
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            bySourceStatus: [
              {
                $group: {
                  _id: { source: '$source', status: '$status' },
                  count: { $sum: 1 },
                },
              },
              { $sort: { '_id.source': 1, '_id.status': 1 } },
            ],
            confirmBySource: [
              {
                $match: {
                  status: ReservationStatus.CONFIRMED,
                  confirmedAt: { $ne: null },
                },
              },
              {
                $group: {
                  _id: '$source',
                  avgMs: {
                    $avg: { $subtract: ['$confirmedAt', '$createdAt'] },
                  },
                },
              },
            ],
            expireBySource: [
              { $match: { status: ReservationStatus.EXPIRED } },
              {
                $group: {
                  _id: '$source',
                  avgMs: {
                    $avg: { $subtract: ['$expiresAt', '$createdAt'] },
                  },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const pendingLive = await this.reservationModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { status: ReservationStatus.PENDING } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ])
      .exec();

    const pendingBySource = new Map(
      pendingLive.map((r) => [r._id, r.count] as const),
    );
    const pendingLiveCount = pendingLive.reduce((n, r) => n + r.count, 0);

    const confirmMap = new Map(
      (facet?.confirmBySource ?? []).map((r) => [r._id, r.avgMs] as const),
    );
    const expireMap = new Map(
      (facet?.expireBySource ?? []).map((r) => [r._id, r.avgMs] as const),
    );

    const statusBySource = new Map<string, Array<{ status: string; count: number }>>();
    for (const row of facet?.bySourceStatus ?? []) {
      const list = statusBySource.get(row._id.source) ?? [];
      list.push({ status: row._id.status, count: row.count });
      statusBySource.set(row._id.source, list);
    }

    // Always emit both known sources so the UI can show empty checkout/manual cards.
    const sources = [
      ReservationSource.CHECKOUT,
      ReservationSource.MANUAL_ORDER,
      ...[...statusBySource.keys()].filter(
        (s) =>
          s !== ReservationSource.CHECKOUT &&
          s !== ReservationSource.MANUAL_ORDER,
      ),
    ];

    const bySource = sources.map((source) => ({
      source,
      byStatus: statusBySource.get(source) ?? [],
      avgToConfirm: formatDurationMs(confirmMap.get(source)),
      avgToExpire: formatDurationMs(expireMap.get(source)),
      pendingLiveCount: pendingBySource.get(source) ?? 0,
    }));

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      byStatus: (facet?.byStatus ?? []).map((r) => ({
        status: r._id,
        count: r.count,
      })),
      pendingLiveCount,
      bySource,
    };
  }

  // ── 7) Dead stock ────────────────────────────────────────────────

  async getDeadStock(params: {
    days: number;
    warehouseId?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponseDto<LowStockRow>> {
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const skip = (page - 1) * limit;

    const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);

    // Variants that sold at least once in the look-back window.
    const sold = await this.orderModel
      .aggregate<{ _id: Types.ObjectId }>([
        {
          $match: {
            status: OrderStatus.PAID,
            createdAt: { $gte: since },
          },
        },
        { $unwind: '$items' },
        { $group: { _id: '$items.variant' } },
      ])
      .exec();
    const soldVariantIds = sold.map((s) => s._id);

    const match: Record<string, unknown> = {
      quantity: { $gt: 0 },
      ...(soldVariantIds.length
        ? { variant: { $nin: soldVariantIds } }
        : {}),
    };
    if (params.warehouseId && Types.ObjectId.isValid(params.warehouseId)) {
      match.warehouse = new Types.ObjectId(params.warehouseId);
    }

    const locale = resolveRequestContentLocale();
    const titlePath = `$title.${locale}`;
    const titleFallback = `$title.${DEFAULT_CONTENT_LOCALE}`;

    // Typed loosely: nested $facet rejects some PipelineStage members at compile time.
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
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
      // Still sitting on shelves (available > 0) and never sold in window.
      { $match: { available: { $gt: 0 } } },
      ...this.leanCatalogLookups(titlePath, titleFallback),
      { $match: { _variant: { $ne: [] }, _product: { $ne: [] } } },
      { $sort: { available: -1, quantity: -1 } },
      {
        $facet: {
          meta: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            this.leanWarehouseLookup(),
            this.leanInventoryProject(),
          ],
        },
      },
    ];

    const [facet] = await this.levelModel
      .aggregate<{
        meta: Array<{ total: number }>;
        data: LowStockRow[];
      }>(pipeline as unknown as PipelineStage[])
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

  // ── 8) Warehouse load ────────────────────────────────────────────

  async getWarehouseLoad(): Promise<WarehouseLoadRow[]> {
    const rows = await this.levelModel
      .aggregate<{
        _id: Types.ObjectId;
        onHand: number;
        reserved: number;
        available: number;
        skuCount: number;
        productCount: number;
        name: string;
        code: string;
      }>([
        {
          $addFields: {
            quantity: { $ifNull: ['$quantity', 0] },
            reservedQuantity: { $ifNull: ['$reservedQuantity', 0] },
          },
        },
        {
          $group: {
            _id: '$warehouse',
            onHand: { $sum: '$quantity' },
            reserved: { $sum: '$reservedQuantity' },
            available: {
              $sum: { $subtract: ['$quantity', '$reservedQuantity'] },
            },
            // One inventory_level row = one variant at this warehouse.
            skuCount: { $sum: 1 },
            // Distinct parent products (several SKUs can share one product).
            _products: { $addToSet: '$product' },
          },
        },
        {
          $addFields: {
            productCount: { $size: '$_products' },
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            localField: '_id',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1, code: 1 } }],
            as: '_wh',
          },
        },
        {
          $addFields: {
            name: {
              $ifNull: [{ $arrayElemAt: ['$_wh.name', 0] }, '(unknown)'],
            },
            code: {
              $ifNull: [{ $arrayElemAt: ['$_wh.code', 0] }, ''],
            },
          },
        },
        { $sort: { onHand: -1 } },
      ])
      .exec();

    return rows.map((r) => ({
      warehouseId: r._id.toString(),
      name: r.name,
      code: r.code,
      onHand: r.onHand,
      reserved: r.reserved,
      available: r.available,
      skuCount: r.skuCount,
      productCount: r.productCount,
    }));
  }

  // ── 10) Slow variants ────────────────────────────────────────────

  async getVariantSales(
    window: AnalyticsDateWindow,
    limit: number,
    sort: 'top' | 'slow',
  ): Promise<VariantSalesRow[]> {
    const match: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    const rows = await this.orderModel
      .aggregate<{
        _id: {
          variant: Types.ObjectId;
          product: Types.ObjectId;
          productName: string;
          currency: string;
        };
        unitsSold: number;
        revenue: number;
        sku: string | null;
      }>([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              variant: '$items.variant',
              product: '$items.product',
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
          $addFields: {
            sku: { $ifNull: [{ $arrayElemAt: ['$_v.sku', 0] }, null] },
          },
        },
        {
          $sort:
            sort === 'top'
              ? { unitsSold: -1, revenue: -1 }
              : { unitsSold: 1, revenue: 1 },
        },
        { $limit: limit },
      ])
      .exec();

    return rows.map((r) => ({
      variantId: r._id.variant.toString(),
      sku: r.sku,
      productId: r._id.product.toString(),
      productName: r._id.productName,
      currency: r._id.currency,
      unitsSold: r.unitsSold,
      revenue: r.revenue,
    }));
  }

  // ── 11) Category / brand revenue ─────────────────────────────────

  async getCatalogRevenue(
    window: AnalyticsDateWindow,
    dimension: 'category' | 'brand',
    limit: number,
  ): Promise<CatalogRevenueRow[]> {
    const match: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    const locale = resolveRequestContentLocale();
    const titlePath = `$title.${locale}`;
    const titleFallback = `$title.${DEFAULT_CONTENT_LOCALE}`;
    const fromCollection = dimension === 'category' ? 'categories' : 'brands';
    const dimPath =
      dimension === 'category' ? '$$p.category' : '$$p.brand';
    const emptyLabel =
      dimension === 'brand' ? '(no brand)' : '(unknown category)';

    const rows = await this.orderModel
      .aggregate<{
        _id: { dim: Types.ObjectId | null; currency: string };
        unitsSold: number;
        revenue: number;
        title: string;
        slug: string | null;
      }>([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            let: { productId: '$items.product' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$productId'] } } },
              { $project: { category: 1, brand: 1 } },
            ],
            as: '_p',
          },
        },
        {
          $addFields: {
            _dimId: {
              $let: {
                vars: { p: { $arrayElemAt: ['$_p', 0] } },
                in: dimPath,
              },
            },
          },
        },
        {
          $group: {
            _id: { dim: '$_dimId', currency: '$currency' },
            unitsSold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] },
            },
          },
        },
        {
          $lookup: {
            from: fromCollection,
            let: { dimId: '$_id.dim' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$dimId'] } } },
              {
                $project: {
                  slug: 1,
                  title: { $ifNull: [titlePath, titleFallback] },
                },
              },
            ],
            as: '_dim',
          },
        },
        {
          $addFields: {
            title: {
              $ifNull: [{ $arrayElemAt: ['$_dim.title', 0] }, emptyLabel],
            },
            slug: { $ifNull: [{ $arrayElemAt: ['$_dim.slug', 0] }, null] },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: limit },
      ])
      .exec();

    return rows.map((r) => ({
      id: r._id.dim ? r._id.dim.toString() : null,
      title: r.title,
      slug: r.slug,
      currency: r._id.currency,
      unitsSold: r.unitsSold,
      revenue: r.revenue,
    }));
  }

  // ── 12) New vs returning ─────────────────────────────────────────

  async getCustomerSegments(
    window: AnalyticsDateWindow,
  ): Promise<CustomerSegments> {
    const match: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    // For each buyer in the window: was their first-ever paid order before `from`?
    const rows = await this.orderModel
      .aggregate<{
        _id: Types.ObjectId;
        firstInWindow: Date;
        globalFirst: Date;
      }>([
        { $match: match },
        {
          $group: {
            _id: '$user',
            firstInWindow: { $min: '$createdAt' },
          },
        },
        {
          $lookup: {
            from: 'orders',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$user', '$$userId'] },
                  status: OrderStatus.PAID,
                },
              },
              { $sort: { createdAt: 1 } },
              { $limit: 1 },
              { $project: { createdAt: 1 } },
            ],
            as: '_first',
          },
        },
        {
          $addFields: {
            globalFirst: { $arrayElemAt: ['$_first.createdAt', 0] },
          },
        },
      ])
      .exec();

    let newCustomers = 0;
    let returningCustomers = 0;

    for (const row of rows) {
      // Returning = had a paid order strictly before the window start.
      // If no `from`, treat first-ever in this result as new when globalFirst
      // equals firstInWindow (first purchase ever landed in the queried set).
      if (window.from) {
        if (row.globalFirst && row.globalFirst < window.from) {
          returningCustomers += 1;
        } else {
          newCustomers += 1;
        }
      } else if (
        row.globalFirst &&
        row.firstInWindow &&
        row.globalFirst.getTime() === row.firstInWindow.getTime()
      ) {
        newCustomers += 1;
      } else {
        returningCustomers += 1;
      }
    }

    return {
      from: window.from?.toISOString() ?? null,
      to: window.to?.toISOString() ?? null,
      newCustomers,
      returningCustomers,
      totalBuyersInWindow: rows.length,
    };
  }

  // ── 13) Top customers ────────────────────────────────────────────

  async getTopCustomers(
    window: AnalyticsDateWindow,
    limit: number,
  ): Promise<TopCustomerRow[]> {
    const match: Record<string, unknown> = {
      status: OrderStatus.PAID,
      ...this.createdAtMatch(window),
    };
    if (window.currency) match.currency = window.currency.toUpperCase();

    const rows = await this.orderModel
      .aggregate<{
        _id: { user: Types.ObjectId; currency: string };
        orderCount: number;
        spend: number;
        name: string;
        email: string;
      }>([
        { $match: match },
        {
          $group: {
            _id: { user: '$user', currency: '$currency' },
            orderCount: { $sum: 1 },
            spend: { $sum: '$amount' },
          },
        },
        { $sort: { spend: -1 } },
        { $limit: limit },
        {
          // Lean user join — only name + email for the admin table.
          $lookup: {
            from: 'users',
            let: { userId: '$_id.user' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
              { $project: { name: 1, email: 1 } },
            ],
            as: '_u',
          },
        },
        {
          $addFields: {
            name: {
              $ifNull: [{ $arrayElemAt: ['$_u.name', 0] }, '(deleted user)'],
            },
            email: {
              $ifNull: [{ $arrayElemAt: ['$_u.email', 0] }, ''],
            },
          },
        },
      ])
      .exec();

    return rows.map((r) => ({
      userId: r._id.user.toString(),
      name: r.name,
      email: r.email,
      currency: r._id.currency,
      orderCount: r.orderCount,
      spend: r.spend,
    }));
  }

  // ── shared helpers ───────────────────────────────────────────────

  private leanCatalogLookups(
    titlePath: string,
    titleFallback: string,
  ): Record<string, unknown>[] {
    return [
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
            { $project: { sku: 1, barcode: 1 } },
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
                slug: 1,
                title: { $ifNull: [titlePath, titleFallback] },
              },
            },
          ],
          as: '_product',
        },
      },
    ];
  }

  private leanWarehouseLookup(): Record<string, unknown> {
    return {
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
          { $project: { name: 1, code: 1 } },
        ],
        as: '_warehouse',
      },
    };
  }

  private leanInventoryProject(): Record<string, unknown> {
    return {
      $project: {
        _id: 0,
        quantity: 1,
        reservedQuantity: 1,
        available: 1,
        variant: {
          $let: {
            vars: { v: { $arrayElemAt: ['$_variant', 0] } },
            in: {
              $cond: [
                { $eq: ['$$v', null] },
                null,
                {
                  id: { $toString: '$$v._id' },
                  sku: '$$v.sku',
                  barcode: '$$v.barcode',
                },
              ],
            },
          },
        },
        product: {
          $let: {
            vars: { p: { $arrayElemAt: ['$_product', 0] } },
            in: {
              $cond: [
                { $eq: ['$$p', null] },
                null,
                {
                  id: { $toString: '$$p._id' },
                  title: '$$p.title',
                  slug: '$$p.slug',
                },
              ],
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
    };
  }

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
