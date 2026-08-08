export enum OrderSource {
  CHECKOUT = 'checkout',
  MANUAL_ORDER = 'manual_order',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}
