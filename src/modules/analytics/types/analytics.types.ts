/**
 * Response shapes for admin dashboard charts / KPI cards.
 * These are NOT Mongo schemas — analytics is read-only over existing collections.
 */

/** Normalized date / currency filter used by repository aggregates. */
export type AnalyticsDateWindow = {
  from?: Date;
  to?: Date;
  currency?: string;
};

export type MoneyBucket = {
  currency: string;
  /** Sum of payment.amount for status=paid in the window (by paidAt). */
  grossRevenue: number;
  /** Sum of payment.amount for status=refunded in the window (by refundedAt). */
  refundedAmount: number;
  /** grossRevenue - refundedAmount (same currency only). */
  netRevenue: number;
  paidCount: number;
  refundedCount: number;
};

export type OrderStatusBucket = {
  status: string;
  count: number;
};

export type AnalyticsSummary = {
  /** Echo of the filter window so the UI can label the chart. */
  from: string | null;
  to: string | null;
  ordersByStatus: OrderStatusBucket[];
  /** One row per currency (or a single row if currency= was passed). */
  money: MoneyBucket[];
};

export type OrdersByDayPoint = {
  /** YYYY-MM-DD (UTC day bucket). */
  date: string;
  currency: string;
  orderCount: number;
  /** Sum of order.amount for paid orders created that day. */
  revenue: number;
};

export type TopProductRow = {
  productId: string;
  productName: string;
  currency: string;
  unitsSold: number;
  revenue: number;
};

/** Lean joined docs — only fields the admin table needs (no full populate). */
export type LowStockVariantInfo = {
  id: string;
  sku: string;
  barcode?: string;
};

export type LowStockProductInfo = {
  id: string;
  /** Resolved for the request locale (fallback to default). */
  title: string;
  slug: string;
};

export type LowStockWarehouseInfo = {
  id: string;
  name: string;
  code: string;
};

export type LowStockRow = {
  quantity: number;
  reservedQuantity: number;
  available: number;
  variant: LowStockVariantInfo | null;
  product: LowStockProductInfo | null;
  warehouse: LowStockWarehouseInfo | null;
};

// ── Extended insights (v1.1) ───────────────────────────────────────

/** 1) Checkout drop-off: payment status counts (+ split by provider). */
export type PaymentFunnel = {
  from: string | null;
  to: string | null;
  byStatus: Array<{ status: string; count: number; amount: number }>;
  byProviderStatus: Array<{
    provider: string;
    status: string;
    count: number;
    amount: number;
  }>;
};

/** 2) Refund intensity + top reasons. */
export type RefundAnalytics = {
  from: string | null;
  to: string | null;
  byCurrency: Array<{
    currency: string;
    grossRevenue: number;
    refundedAmount: number;
    /** refundedAmount / grossRevenue (0 if no gross). */
    refundRate: number;
    refundedCount: number;
  }>;
  topReasons: Array<{ reason: string; count: number; amount: number }>;
};

/** 3) Where revenue comes from (order.source + payment.provider). */
export type RevenueBySource = {
  from: string | null;
  to: string | null;
  bySource: Array<{
    source: string;
    currency: string;
    orderCount: number;
    revenue: number;
  }>;
  byProvider: Array<{
    provider: string;
    currency: string;
    paymentCount: number;
    revenue: number;
  }>;
};

/** 4) Average order value from paid payments. */
export type AovAnalytics = {
  from: string | null;
  to: string | null;
  byCurrency: Array<{
    currency: string;
    paidCount: number;
    grossRevenue: number;
    /** grossRevenue / paidCount */
    aov: number;
  }>;
};

/** Per-source slice — checkout (~30m TTL) vs manual_order (~48h TTL). */
export type ReservationHealthBySource = {
  source: string;
  byStatus: Array<{ status: string; count: number }>;
  /** Average createdAt → confirmedAt, e.g. "8m 32s". */
  avgToConfirm: string | null;
  /**
   * Average createdAt → expiresAt on expired rows, e.g. "30m 0s" / "2d 0h 0m 0s".
   * Should land near that source's TTL (unless extended).
   */
  avgToExpire: string | null;
  /** Live pending holds for this source (not limited to the date window). */
  pendingLiveCount: number;
};

/** 5) Reservation / checkout-hold health. */
export type ReservationHealth = {
  from: string | null;
  to: string | null;
  /** Totals across all sources (window). */
  byStatus: Array<{ status: string; count: number }>;
  pendingLiveCount: number;
  /**
   * Split by source so 30m checkout holds are not averaged with 48h manual holds.
   * That mix was producing a meaningless ~1 day “avg expire”.
   */
  bySource: ReservationHealthBySource[];
};

/** 8) Stock distribution across warehouses. */
export type WarehouseLoadRow = {
  warehouseId: string;
  name: string;
  code: string;
  onHand: number;
  reserved: number;
  available: number;
  /** Distinct variants (SKU rows) with a level in this warehouse. */
  skuCount: number;
  /** Distinct products (parent) with at least one level in this warehouse. */
  productCount: number;
};

/** 9 / 10) Variant-level sales ranks. */
export type VariantSalesRow = {
  variantId: string;
  sku: string | null;
  productId: string;
  productName: string;
  currency: string;
  unitsSold: number;
  revenue: number;
};

/** 11) Merchandising rollups. */
export type CatalogRevenueRow = {
  id: string | null;
  title: string;
  slug: string | null;
  currency: string;
  unitsSold: number;
  revenue: number;
};

/** 12) New vs returning buyers in the window. */
export type CustomerSegments = {
  from: string | null;
  to: string | null;
  newCustomers: number;
  returningCustomers: number;
  /** Users with ≥1 paid order in the window. */
  totalBuyersInWindow: number;
};

/** 13) Highest-spend customers (admin CRM-style; includes email). */
export type TopCustomerRow = {
  userId: string;
  name: string;
  email: string;
  currency: string;
  orderCount: number;
  spend: number;
};
