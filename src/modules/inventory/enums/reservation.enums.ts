export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

export enum ReservationSource {
  CHECKOUT = 'checkout',
  MANUAL_ORDER = 'manual_order',
}
