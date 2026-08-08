# Business Rules — Products, Inventory, Warehouses, Orders, Payments

This document lists the invariants and business rules of the catalog / stock / order /
payment system. Read it before working on any of these modules. If you change a rule
here, update this file in the same PR.

Modules covered:

| Domain | Path |
|---|---|
| Products & Variants | `src/modules/products/` |
| Warehouses | `src/modules/warehouses/` |
| Inventory (movements, levels, reservations) | `src/modules/inventory/` |
| Orders | `src/modules/orders/` |
| Payments | `src/modules/payments/` |
| Cart | `src/modules/cart/` |

---

## 1. Core data model

```
warehouses                 physical locations (one is default)
inventory_levels           balance per variant × warehouse (quantity, reservedQuantity)
inventory_movements        append-only ledger (every stock change, never edited)
inventory_reservations     stock holds for pending orders (lines per warehouse)
product_variants.stock     CACHE = SUM(levels.quantity) for that variant
orders                     line items + totals + status (source of truth for "what was bought")
payments                   money side; links to order (no line items of its own)
```

### Golden invariants

1. `variant.stock` = sum of `inventory_levels.quantity` for that variant, always.
2. `available = level.quantity − level.reservedQuantity` and must stay `>= 0` per level.
3. Every change to `level.quantity` (and `variant.stock`) has exactly one matching
   row in `inventory_movements`. The ledger is append-only: no updates, no deletes.
4. Line items live **only on the Order**. Payment references the order; it has no
   item list of its own.

---

## 2. Products & Variants

`Product` is the catalog/marketing entity (title, description, images, category,
brand). It is **never** sellable by itself — every purchasable unit is a
`ProductVariant` (`product_variants` collection). Even a "simple" product with no
real options gets exactly one **default variant**.

### Options model

- A product declares up to **3 option axes** (`optionDefinitions`,
  `MAX_PRODUCT_OPTION_TYPES`), each a fixed enum type — `color` | `size` | `weight`
  | `material` | `brand` | `model` — with its own list of allowed `values`.
  Free-text option types are not allowed.
- No duplicate types on one product, no duplicate values within one type
  (case-insensitive).
- `groupBy` is **display-only** (which axis the admin matrix groups by) and must be
  one of the product's own `optionDefinitions` types. Defaults to the first
  definition; forced to `null` if there are no definitions.
- A variant's `options` map must satisfy the product's definitions exactly:
  - every defined type must be present on the variant,
  - every value must be one of that type's allowed values,
  - no options at all are allowed if the product has no `optionDefinitions`
    (`product.optionsNotAllowed`).
  Options are normalized (trimmed, lower-cased) before validation and storage.
- `optionsKey` is a **derived, server-only** fingerprint of the normalized options
  (`buildOptionsKey`) — e.g. `color:red|size:48`, or `__default__` when empty. It is
  never accepted from the client and backs the uniqueness rule below.

### Variant identity & uniqueness

- `sku` and `barcode` are globally unique (case rules: SKU stored UPPERCASE,
  barcode trimmed), enforced by partial unique indexes (`deletedAt: null`) — a
  soft-deleted variant's SKU/barcode can be reused.
- `(product, optionsKey)` is unique per product (partial, not-deleted) — you cannot
  create two variants with the same option combination on the same product.
- Exactly **one default variant per product**, enforced by a partial unique index
  on `(product, isDefault: true)`:
  - the first variant created for a product is always the default;
  - setting a new variant/update as default clears the previous default in the
    same transaction;
  - **you cannot unset the default flag directly** (`product.cannotUnsetDefaultVariant`)
    — only replace it by making another variant default.
- Bulk create additionally rejects duplicate SKU / barcode / options-key **within
  the same request payload**, before touching the DB.

### Price & stock invariants

- `priceAfterDiscount` (if set) must be `<= price` (`product.invalidPriceAfterDiscount`).
  If an update raises `price` without explicitly changing `priceAfterDiscount`, and
  the old discount now exceeds the new price, the discount is silently clamped down
  to the new price (never left inconsistent).
- A variant may not be `active` with `stock <= 0` (`product.invalidStockStatus`) —
  checked against the *current* stock, since stock itself is not client-settable
  (see below).
- Status resolution is centralized in `resolveProductStatus` (single source of
  truth, both products and variants):
  - `inactive` is always respected regardless of stock (admin hide wins);
  - `stock <= 0` ⇒ `outOfStock` (unless `inactive`);
  - stock recovering from 0 while status was `outOfStock` ⇒ back to `active`;
  - otherwise the requested/existing status is kept.

### Stock is inventory-owned, not variant-owned

- `variant.stock` is a **read-only cache**; it is never set directly by a create/update
  DTO. Creating a variant persists `stock: 0` and then calls
  `InventoryService.postInitialStock` (opening balance + ledger row) in the same
  transaction — see §5 Inventory movements.
- `update()` never accepts a stock field; PATCH may only change `status`, and even
  that is re-resolved against the variant's *current* stock via
  `resolveProductStatus`. All quantity changes must go through Inventory
  (`postMovement`), never through the Products module.

### Deletion

- A product's variants cannot be reduced to zero: deleting the last remaining
  (non-deleted) variant of a product is blocked (`product.cannotDeleteLastVariant`).
- Deleting the **default** variant auto-promotes the next remaining variant (by
  `order`) to default, so the invariant "exactly one default" never breaks.
- Variant delete is a soft delete (`deletedAt`); all uniqueness indexes are partial
  on `deletedAt: null` so the SKU/barcode/options-key/default slot free up for reuse.

### Purchasability (`findAvailableById`)

A variant is sellable only if **all** of:
- the variant exists and isn't soft-deleted,
- its parent product exists and is not `inactive`,
- the variant itself is not `inactive` or `outOfStock`, and `stock > 0`.

This is the gate used by checkout/manual-order item building (§9). Note it checks
the **cached stock**, not live availability — the reservation layer's
`assertAvailable` (§6) is the real "can we actually promise this many units"
check, because stock may already be held by other pending reservations.

---

## 3. Warehouses

Rules enforced in `WarehousesService`:

- **Exactly one default warehouse.** The first live warehouse created is forced to
  be default. Setting `isDefault: true` on another warehouse clears the previous
  default in the same transaction.
- **You cannot unset the default flag** (`warehouse.cannotUnsetDefault`). You can
  only move it by making another warehouse default.
- **Codes are unique**, stored trimmed + UPPERCASE.
- **Soft delete guards** — a warehouse cannot be deleted if it:
  - is the default (`cannotDeleteDefault`),
  - is the last remaining warehouse (`cannotDeleteLast`),
  - has any level with `quantity > 0` (`cannotDeleteWithStock`) — transfer stock out first.
- **Stock writes require a usable warehouse**: exists, not soft-deleted, `isActive`.
  Enforced by `assertUsable` inside `postMovement` (skippable only when the caller
  already validated, e.g. transfers).
- `order` (number) controls allocation priority among non-default warehouses.

The default warehouse is used for:
- initial stock when a variant is created,
- first pick in reservation allocation (see §6).

---

## 4. Inventory levels (`inventory_levels`)

- One document per **variant × warehouse** (unique index).
- `quantity` = on-hand at that location. `min: 0`.
- `reservedQuantity` = units held by **pending** reservations at that location. `min: 0`.
- **Ownership:**
  - only `InventoryService.postMovement` may change `quantity`;
  - only `ReservationsService` may change `reservedQuantity`.
  - Nothing else writes to levels. No exceptions.
- Reserve/release are **atomic filtered updates** (no read-then-write):
  - `increaseReserved` matches only if `quantity − reservedQuantity >= qty`
    (via `$expr`), so two concurrent reservations cannot oversell;
  - `decreaseReserved` matches only if `reservedQuantity >= qty`.
  - A `null` result means the condition failed → caller throws `reservation.reserveConflict`
    and the transaction rolls back.

---

## 5. Inventory movements (ledger)

All stock changes go through **one method**: `InventoryService.postMovement`.
Do not write to levels, `variant.stock`, or the movements collection anywhere else.

Allowed entry points:

| Caller | Type | Direction | Warehouse |
|---|---|---|---|
| `postManualMovement` (admin HTTP) | restock / return / adjustment / damage | restock+return = in, damage = out, adjustment = explicit | required in DTO |
| `postInitialStock` (variant create) | initial | in | default |
| `transfer` (admin HTTP) | transfer ×2 | out @ from, in @ to | both validated, same TX, shared `referenceId` |
| `ReservationsService.confirmByOrderId` | sale | out | each reservation line's warehouse |

Rules inside `postMovement`:

- `quantity >= 1`; direction gives the signed delta.
- **Idempotency key** = `(referenceType, referenceId, variant, type, warehouse)`.
  If a movement with that key exists, it is returned instead of creating a new one
  (webhook retries, transfer replays). Duplicate-key errors on insert are resolved
  the same way. Manual admin movements pass no `referenceId` and are not deduplicated.
- Level may not go below 0; `variant.stock` may not go below 0.
- `variant.stock` update uses an **optimistic lock** (filter on previous stock value);
  losing the race throws `inventory.stockConflict` and rolls back.
- Variant `status` is re-resolved from the new stock (e.g. out_of_stock).
- Every movement stores `balanceBefore` / `balanceAfter` of the **level** it touched.
- Session rule: if the caller passes a `session`, `postMovement` joins that
  transaction; otherwise it opens its own `withTransaction`. Never nest transactions.

Reference types for sales: `webhook` (Stripe/Klarna) or `manual_order` (admin
mark-paid). Sale `referenceId` = **order id** (not payment id).

---

## 6. Reservations (stock holds)

A reservation holds stock for one order between "customer committed" and
"payment settled". Collection: `inventory_reservations`.

### Shape

- Required links: `order` (unique) and `payment` (unique) — one reservation per order.
- `user` = customer; `createdBy` = customer (checkout) or admin (manual order).
- `source`: `checkout` | `manual_order`.
- `lines[]`: variant + product + **warehouse** + quantity — the allocation result.
- `status`: `pending` → `confirmed` | `released` | `expired`.
- `expiresAt` (TTL by source, `reservation.constants.ts`):
  - checkout: **30 minutes** (hold while redirected to the provider — long
    enough to cover slow 3D Secure / bank-redirect flows),
  - manual order: **48 hours** (bank transfer / payment proof takes longer).

### Allocation strategy (S1)

`allocate()` — pure computation, no writes:

1. Order warehouses: **default first**, then remaining active warehouses by `order`.
2. Greedy: take `min(available, remaining)` from each warehouse until filled.
3. If total available can't cover the request → `reservation.insufficientAvailable`.

### Creating (checkout / manual order — inside the caller's TX)

For each allocated line, `increaseReserved` re-checks availability atomically.
Any failure aborts the whole transaction (order + payment + reservation are
all-or-nothing).

### Confirming (payment paid → `confirmByOrderId`)

1. Not found → 404. Already `confirmed` → return as-is (**idempotent**, safe for
   webhook retries). `released`/`expired` → `reservation.cannotConfirm`.
2. **Lazy expiry:** status may still be `pending` after `expiresAt` — nothing
   flips it at the exact moment. If `expiresAt < now`: release lines, mark
   `expired`, throw `reservation.expired`. Never trust `status` alone; a pending
   hold is valid only while `expiresAt` is in the future.
3. Per line: `decreaseReserved` (clear the hold) **then** post a `sale` movement
   (OUT) at that line's warehouse. Both — or neither — happen (one TX).
   Skipping the decrease would double-count: units both reserved and sold.
4. Mark `confirmed` + `confirmedAt`.

### Releasing (`releaseByOrderId`)

- Only `pending` reservations release stock; anything else is returned unchanged
  (idempotent).
- Release = `decreaseReserved` per line + status `released` (or `expired`) +
  `releasedAt`. `quantity` is untouched — stock simply becomes available again.

### Availability

`getAvailability(variantId)` aggregates levels:
`available = max(0, onHand − reserved)` per warehouse and in total.
**Anything that checks purchasability (cart, checkout, manual order) must use
availability, not raw `variant.stock`** — stock on hand may already be promised
to other pending orders.

---

## 7. Cart

One cart per user (`cart.user` unique). The cart is a **shopping list, not a
hold** — adding an item never touches `reservedQuantity`; the real stock hold
only happens at checkout (§6). This has a direct consequence: the cart's
availability check is **advisory**. Two customers can both be shown the last
unit as available; whoever checks out first wins the reservation, and the
other is rejected at checkout, not at add-to-cart time. Cart hardening (this
section) is about making that gap visible to the client, not eliminating it —
eliminating it would mean holding stock for people who haven't committed to
buy, which is worse UX.

### Price snapshot (drift detection only)

- Each line stores `unitPriceAtAdd` and `productNameAtAdd`, re-stamped from the
  **live** variant every time the line's quantity is set (create, merge via
  `addItem`, or `updateItem`) via the shared `resolveVariantUnitPrice` helper
  (also used by checkout and manual orders — one price rule, not three).
- These fields are **never used for billing**. Checkout always re-prices from
  the live variant (§9). They exist only so the read model can flag
  `priceChanged` without an extra round trip.

### Read-time enrichment (`CartView`)

`GET /cart` and every mutation return a computed view, not the raw document.
Nothing is silently dropped or auto-corrected — the client decides what to do
with a flagged line. Per item:

- `available` + `unavailableReason` (`deleted` | `inactive` | `outOfStock` |
  `insufficientStock`), checked in that priority order against the **live**
  variant/product (soft-delete, status) and live `ReservationsService.getAvailability`
  (not the cached `variant.stock`).
- `priceChanged` = live price ≠ `unitPriceAtAdd` (only meaningful when available).
- `lineSubtotal` = `currentUnitPrice × quantity` for available lines, `0` otherwise.

Cart-level:

- `subtotal` = sum of `lineSubtotal` — **purchasable lines only**.
- `itemsCount` = sum of quantities across **all** lines, including unavailable
  ones, so a cart badge doesn't silently shrink because something went out of
  stock.

### Other rules

- **Quantity cap per line** (`CART_MAX_ITEM_QUANTITY`, currently 50) is
  independent of stock — a sanity ceiling, not an availability check.
- **Concurrency:** cart writes mutate the `items` array, which Mongoose
  versions by default (`__v`). A losing concurrent write (double-click, two
  tabs) gets **one automatic retry** against freshly re-read state; a second
  collision returns `cart.conflict` (409) instead of a raw error.
- Only `CartService` writes to cart documents.

---

## 8. Orders

- Order is the source of truth for **what was bought**: `items[]`
  (variant, product, quantity, unitPrice, productName snapshot), `subtotal`,
  `deliveryFee`, `amount`, `currency`.
- `source`: `checkout` (customer self-serve) | `manual_order` (admin for a customer).
- `status`: `pending_payment` → `paid` | `cancelled` | `refunded`.
- `user` = customer; `createdBy` = customer or admin.
- A customer can only read their own orders; staff can read all.
- **One pending order per user** — checkout is blocked while a
  `pending_payment` order (or pending payment) exists; the user must resume or
  cancel it first.
- `OrdersService` is thin (CRUD + status). Orchestration lives in
  `OrdersFacadeService` (manual orders) and `PaymentsService` (checkout).
  Order status changes are driven by the payment lifecycle, never by the client.

---

## 9. Payments

- Payment holds the money side: `amount`, `currency`, `provider`, `status`,
  provider reference, proof fields. It links to `order` (and `reservation`);
  **it has no line items**.
- `status`: `pending` → `paid` | `failed` | `cancelled` | `expired` | `refunded`.
- Providers: Stripe / Klarna (redirect + webhook) and `manual` (admin marks paid).

### Checkout (customer, `createCheckout`)

1. Cart must be non-empty; no pending payment or pending order may exist.
2. Every cart line is re-validated against **fresh** variant data (price, active
   status) and **availability** (§6) — never against the cart's stale copy.
3. One transaction creates: order (`pending_payment`) + payment (`pending`) +
   reservation (allocate + `increaseReserved`), then cross-links them.
4. The Stripe/Klarna session is created **after** the commit (external calls never
   run inside a Mongo TX). Provider reference is saved on the payment.
5. `resumeCheckout` reuses the pending payment; if the reservation expired it
   cancels everything and reports `reservation.expired`.
6. `cancelPendingCheckout` releases the reservation, cancels the order, then
   marks the payment `cancelled`.

### Manual order (admin, `OrdersFacadeService.createManualOrder`)

Same one-TX pattern with `source = manual_order`, provider `manual`, and the
48-hour reservation TTL. `createdBy` = admin, `user` = customer.

### Webhook (`handleWebhook`)

- The event is verified by the provider strategy first.
- Unmatched payments are logged and ignored (never throw at the provider).
- Already `paid` → return (**idempotent**; retries are expected).
- On `paid`: update payment, then fulfill — `confirmByOrderId` (reservation →
  sale movements with `referenceId = orderId`, `referenceType = webhook`) and mark
  the order `paid`.

### Mark paid (admin, `markPaid`)

- Only allowed while payment is `pending` (`payment.notPending`); guards against
  double fulfillment.
- Stores proof: `images[]`, `note`, `paidBy` (admin), `paidAt`.
- The repository update is itself conditional on `pending` (second defense
  against two admins racing), then fulfills with `referenceType = manual_order`.

### Refunds (admin, `PaymentsService.refund`)

- **Scope**: full-amount only, admin/manager-initiated, **Stripe and Manual
  providers only**. Klarna (and any future provider without a `refund()`
  strategy method) throws `payment.refundNotSupported` — the interface method
  is optional precisely so unsupported providers don't need a stub.
- Only allowed while payment is `paid` (`payment.cannotRefund` otherwise) — no
  double refunds, no refunding a payment that never completed.
- Stripe: resolves the Checkout Session's underlying `payment_intent` and
  calls `stripe.refunds.create`; the returned refund id is stored as
  `payment.refundReference`. Manual: no provider call, the money was returned
  offline by the admin.
- **Restock** replays the exact `reservation.lines` recorded at sale time
  (same variant, same warehouse, same quantity) as a `RETURN` movement with
  `referenceType = refund`, `referenceId = orderId` — it reverses the original
  `SALE` movement precisely instead of guessing a warehouse.
- One transaction: post the restock movement(s) + `order.status = refunded`.
  Payment is flipped to `refunded` (with `refundedAt`/`refundedBy`/
  `refundReason`/`refundReference`) after that transaction commits.
- Reservation status is **not** changed by a refund — it stays `confirmed`;
  refund is a separate, later event layered on top of a completed sale.

### Reconciliation (`PaymentReconciliationService`, cron)

A scheduled sweep (`@Cron(EVERY_MINUTE)`) catches payments that would
otherwise get stuck, independent of any webhook:

1. **Expire stale reservations** — any `pending` reservation whose
   `expiresAt` has passed (customer abandoned checkout) is released
   (`ReservationsService.releaseByOrderId(..., expired)`), its order is
   marked `cancelled`, and its payment is marked `expired`. **Before**
   releasing, if the payment's provider supports `getStatus()`, it's asked
   one last time whether the payment actually already succeeded (closes the
   race where a slow 3D Secure / bank-redirect checkout completes right as
   the TTL passes). If so: the reservation's `expiresAt` is pushed a few
   minutes forward (stock hasn't been released yet, so this is safe) and the
   payment is fulfilled normally instead of expired — no stock is lost, no
   captured payment is silently dropped. `PaymentsService.applyStatusTransition`
   also refuses to silently ignore a late `paid` signal on an already
   non-`pending` payment; it logs an error for manual admin follow-up
   (fulfill if stock allows, refund otherwise) instead, since that residual
   sliver of a race (webhook/poll disagreement in the same instant as
   expiry) can't be fully closed without distributed locking.
2. **Re-poll stuck payments** — a `pending` payment (any provider except
   `manual`) with a `providerReference` that hasn't heard from a webhook is
   actively checked via `strategy.getStatus()`. Any resulting status flows
   through the same `PaymentsService.applyStatusTransition()` the webhook
   handler uses, so a late webhook and a reconciliation poll can never
   disagree. Today only Stripe implements `getStatus()`; the query itself
   isn't hardcoded to Stripe — a future provider gets swept automatically
   the moment it implements `getStatus()` on its strategy, no repo change
   needed. Providers that don't (Klarna today) are skipped in the service
   loop (`if (!strategy.getStatus) continue`), not filtered out of the query.
3. **Backoff, not busy-polling** — each miss (still `pending`) increases
   `payment.reconciliationAttempts` and pushes `payment.nextReconciliationAt`
   out (2m, 4m, 8m, ... capped at 30m). The sweep's DB query only pulls
   payments whose backoff window has actually elapsed, so a payment stuck
   pending for hours doesn't get polled every minute.
- Manual payments are excluded from the poll (no external session to check
  — the admin marks them paid directly); they rely on the expiry pass only.

---

## 10. Transactions & concurrency — summary

- MongoDB transactions require a **replica set**.
- Pattern everywhere: `run(session)` — join the caller's session if given,
  otherwise start `withTransaction` locally. **Never nest transactions.**
- External calls (Stripe, email) always happen **outside** transactions.
- Concurrency safety relies on atomic conditional updates, not on reads:
  - reserve: `$expr` availability check in the update filter,
  - stock cache: optimistic lock on previous `variant.stock`,
  - idempotency: unique movement key + "already confirmed/paid → return" checks.

## 11. Ownership cheat-sheet

| Field / collection | Only writer |
|---|---|
| `variant.stock` + stock-driven `status` | `InventoryService.postMovement` |
| `variant.optionsKey` | `ProductVariantsService` (derived, never client input) |
| `variant.isDefault` (per product, exactly one) | `ProductVariantsService` |
| `inventory_levels.quantity` | `InventoryService.postMovement` |
| `inventory_levels.reservedQuantity` | `ReservationsService` |
| `inventory_movements` | `InventoryService.postMovement` (insert only) |
| `inventory_reservations.status` | `ReservationsService` |
| `cart.items` (incl. `unitPriceAtAdd`/`productNameAtAdd`) | `CartService` |
| `orders.status` | `OrdersService`, driven by Payments flows |
| `payments.status` | `PaymentsService` (webhook / mark-paid / cancel / refund), `PaymentReconciliationService` (expire / re-poll) |

## 12. Operational prerequisites

- MongoDB running as a **replica set** (transactions).
- At least one active **default warehouse** must exist before creating variants
  with initial stock or accepting checkouts.
- `PaymentReconciliationService`'s cron sweep runs in-process via
  `@nestjs/schedule` (`ScheduleModule.forRoot()` in `AppModule`) — no external
  scheduler required, but only one app instance should run it in a
  multi-instance deployment (not yet guarded by a distributed lock).
- If upgrading from the pre-warehouse ledger: drop the old unique index
  `referenceType_1_referenceId_1_variant_1_type_1` on `inventory_movements`
  (replaced by the variant that includes `warehouse`).
