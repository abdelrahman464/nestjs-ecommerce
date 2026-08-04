/**
 * How the movement entered the system.
 * Prefer this over inventing actorType — `createdBy` is set when a human acted.
 */
export enum InventoryReferenceType {
  /** Admin inventory UI (restock, damage, adjustment, …). */
  MANUAL = 'manual',
  /** Opening stock written during variant create. */
  VARIANT_CREATE = 'variant_create',
  /** Payment provider webhook / automated fulfillment. */
  WEBHOOK = 'webhook',
  /** Staff placed an order on behalf of a customer (Orders phase). */
  MANUAL_ORDER = 'manual_order',
  /** Inter-warehouse transfer pair (shared referenceId on out + in). */
  TRANSFER = 'transfer',
}
