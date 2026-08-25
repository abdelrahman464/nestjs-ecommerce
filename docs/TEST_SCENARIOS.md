# Manual Test Scenarios — Cart, Warehousing, Reservations, Payments, Media, Analytics

A Postman-driven test plan for the hardest parts of the system: cart hardening,
multi-warehouse allocation, reservations/availability, checkout, manual orders,
refunds, reconciliation, catalog images, and admin analytics. Each scenario states
the **rule being verified**, the **setup**, the **requests**, and the **expected
result**, so a failure tells you exactly which invariant broke.

Cross-reference: [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) explains *why*
each rule exists; [`MEDIA.md`](./MEDIA.md) covers image attach/release. This
file is only about *proving it holds*.

---

## 0. Postman setup

**Variables** (collection or environment):

| Variable | Example |
|---|---|
| `URL` | `http://localhost:8000/api/v1` |
| `adminEmail` / `adminPassword` | seeded admin user |
| `userEmail` / `userPassword` | a normal `USER` account |

**Auth:** login is cookie-based (`POST /auth/login` sets httpOnly
`accessToken`/`refreshToken` cookies via `Set-Cookie`). In Postman:
enable **"Automatically follow redirects"** and make sure the collection's
cookie jar is on (default) — no manual `Authorization` header needed once
you've logged in in the same Postman session/cookie jar. Keep **two** logged-in
sessions handy (two Postman cookie jars, or run admin calls from a separate
tab/incognito-equivalent) since most scenarios need both an admin and a
regular user acting in sequence.

```
POST {{URL}}/auth/login
{ "email": "{{adminEmail}}", "password": "{{adminPassword}}" }
```

**Seed data you'll need before anything else:**

1. Two warehouses: a default one (`isDefault: true`, created automatically as
   default if it's the first) and a second non-default one.
2. One product with one variant that has stock split across both warehouses
   (see §2 for exactly how to get stock into a *specific* warehouse — initial
   variant stock always lands in the *default* warehouse only).

```
POST {{URL}}/warehouses   (admin/manager)
{ "name": "Main", "code": "MAIN" }              → becomes default automatically (first one)

POST {{URL}}/warehouses
{ "name": "Overflow", "code": "OVF" }           → not default
```

---

## 1. Warehouse rules

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 1.1 | Delete the only warehouse | Can never have zero warehouses | `DELETE /warehouses/:id` on the only one | `400 warehouse.cannotDeleteLast` |
| 1.2 | Delete the default warehouse | Default can't be deleted directly | With 2+ warehouses, `DELETE` the default one | `400 warehouse.cannotDeleteDefault` |
| 1.3 | Delete a warehouse with stock | Stock must be moved out first | `POST /inventory/movements` (restock) into "Overflow", then `DELETE /warehouses/:overflowId` | `400 warehouse.cannotDeleteWithStock` |
| 1.4 | Delete a warehouse with **zero** stock | Happy path | Restock 0 or transfer stock away first, then delete | `200 OK`, `deletedAt` set |
| 1.5 | Unset `isDefault` via PATCH | Default flag can't be cleared directly (only reassigned) | `PATCH /warehouses/:defaultId { "isDefault": false }` | `400 warehouse.cannotUnsetDefault` |
| 1.6 | Create a second warehouse with `isDefault: true` | Exactly one default at a time | `POST /warehouses { ..., "isDefault": true }` | `201`, and re-fetch the old default → its `isDefault` is now `false` |
| 1.7 | Duplicate warehouse code | Codes are unique (case-insensitive — stored uppercased) | `POST /warehouses` twice with `code: "main"` / `"MAIN"` | Second call → `409 warehouse.codeExists` |
| 1.8 | Manual movement / transfer against an **inactive** warehouse | Stock writes require an active warehouse | `PATCH /warehouses/:id { "isActive": false }`, then `POST /inventory/movements` targeting it | `400 warehouse.inactive` |

---

## 2. Inventory levels & movements

Setup a variant with **known stock** first:

```
POST {{URL}}/inventory/movements   (admin/manager)
{
  "variantId": "{{variantId}}",
  "warehouseId": "{{mainWarehouseId}}",
  "type": "restock",
  "quantity": 20
}
```

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 2.1 | Restock at Main | `variant.stock` and the level both increase by the same delta | Restock 20 at Main | `GET /inventory/variants/:variantId/levels` → `totalStock: 20`; variant's own `stock` field matches |
| 2.2 | Transfer Main → Overflow | Net `variant.stock` change is 0; per-warehouse levels move | `POST /inventory/transfers { variantId, fromWarehouseId: main, toWarehouseId: overflow, quantity: 5 }` | Two movements created (`out`+`in`); Main level `15`, Overflow level `5`; `totalStock` still `20` |
| 2.3 | Transfer same warehouse | Can't transfer to itself | `fromWarehouseId === toWarehouseId` | `400 inventory.transferSameWarehouse` |
| 2.4 | Damage more than on-hand | Levels can never go negative | `POST /inventory/movements { type: "damage", quantity: 999 }` | `400 inventory.insufficientStock` (shows `available` vs `requested`) |
| 2.5 | Adjustment without `direction` | `direction` is required only for `adjustment` | `POST /inventory/movements { type: "adjustment", quantity: 3 }` (no `direction`) | `400 inventory.directionRequired` |
| 2.6 | Manual movement with `type: "sale"` | Sales can only come from checkout/manual-order fulfillment, never the manual admin endpoint | `POST /inventory/movements { type: "sale", ... }` | `400 inventory.manualTypeNotAllowed` |
| 2.7 | List movements, unscoped | New "all movements" endpoint | `GET /inventory/movements?type=restock&page=1&limit=10` | Paginated list, `product.title` is a **plain localized string** (not `{en,de}`), try with `?lang=de` vs default → title text changes |
| 2.8 | List levels by warehouse | `variant`/`product` populated, `warehouse` isn't (redundant) | `GET /inventory/warehouses/:mainWarehouseId/levels` | Each row has `variant.sku`, `product.title` |
| 2.9 | List levels by variant | `warehouse` populated, `variant` isn't (redundant) | `GET /inventory/variants/:variantId/levels` | Each row has `warehouse.name`/`code`, one row per warehouse holding stock |

---

## 3. Availability & allocation (the core "complex" logic)

This is `ReservationsService.allocate()` — default warehouse first, then by
`order`, greedy-filled.

Setup: with movement 2.2 done, Main = 15, Overflow = 5 (total 20).

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 3.1 | Availability breakdown | `available = quantity - reservedQuantity` per warehouse and in total | `GET /inventory/variants/:variantId/availability` | `onHand: 20, reserved: 0, available: 20`, `byWarehouse` has 2 entries (15 & 5) |
| 3.2 | Add to cart — cart never reserves stock | The cart is advisory-only; it checks availability but doesn't hold stock | Add **10** units to cart (`POST /cart/items`) | `200 OK`; re-check `GET /inventory/variants/:variantId/availability` → `reserved` is still `0` (unchanged) — proves reservations only happen at checkout (3.3), not on add-to-cart |
| 3.3 | Checkout reserves across warehouses when default runs out | Greedy fill: Main (15) first, then spill into Overflow | Cart qty = **18** (> Main's 15), `POST /payments/checkout { "provider": "stripe" }` | `201`; then `GET /inventory/orders/:orderId/reservation` → `lines` has **two** entries: one at Main (qty 15), one at Overflow (qty 3) |
| 3.4 | Checkout when total across all warehouses is insufficient | Reservation must fail atomically — no partial hold left behind | Cart qty = 21 (> total 20) | `400 payment.insufficientStock` at cart-checkout build step, **before** any reservation is attempted |
| 3.5 | Reserve exactly the last unit | Boundary: `available <= 0` warehouses are skipped, not zero-filled | Reduce stock to exactly cart qty, checkout | Succeeds; a follow-up checkout attempt for 1 more unit of the same variant | `400 reservation.insufficientAvailable` |
| 3.6 | Cart quantity cap | `CART_MAX_ITEM_QUANTITY = 50`, independent of real stock | `POST /cart/items { variantId, quantity: 51 }` | `400 cart.quantityExceedsMax` (even if warehouse stock is huge) |
| 3.7 | Add same variant twice (merge) | Quantities merge; cap applies to the **merged** total | Add qty 30, then add qty 30 again (same variant) | Second call → `400 cart.quantityExceedsMax` (30+30=60 > 50), not silently capped |

---

## 4. Cart hardening

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 4.1 | Price drift detection | Cart snapshots `unitPriceAtAdd`; view flags drift without silently re-pricing | Add item to cart, then `PATCH /products/:productId/variants/:variantId` to change its price (admin), then `GET /cart` | `items[].priceChanged: true`, `currentUnitPrice` ≠ `unitPriceAtAdd`; `lineSubtotal` uses the **current** price |
| 4.2 | Product soft-deleted after being carted | Cart must not silently drop it — flag as unavailable | Add to cart, then `DELETE /products/:productId` (must pass deletion guard — needs zero stock/reservations, see §6) | `GET /cart` → item has `available: false`, `unavailableReason: "deleted"`, excluded from `subtotal` |
| 4.3 | Product deactivated | Same idea, different reason | Add to cart, `PATCH` product/variant `status: "inactive"` | `unavailableReason: "inactive"` |
| 4.4 | Stock drops below cart quantity after adding | Availability is re-checked at **read** time, not just add time | Add qty 10 to cart, then admin `damage`s stock down to 5 | `GET /cart` → `unavailableReason: "insufficient_stock"`, `availableQuantity: 5` |
| 4.5 | Concurrent cart writes (optimistic lock) | Lost-update protection via `__v` + retry-once | Fire two `POST /cart/items` requests for the *same* variant back-to-back (Postman Runner with 0ms delay, or two tabs) | Both succeed with quantities summed correctly (2 + 2 = 4, not 2) — retry absorbs the version conflict. To see the **409** path, you'd need 3+ truly simultaneous writes so the retry also collides — a good stress test with Postman's Collection Runner set to iterate concurrently |
| 4.6 | Update quantity beyond cap | Same 50-unit cap on `PATCH` | `PATCH /cart/items/:variantId { "quantity": 60 }` | `400 cart.quantityExceedsMax` |
| 4.7 | Update/remove item that isn't in the cart | Clean 404, not a silent no-op | `PATCH` or `DELETE` on a `variantId` never added | `404 cart.itemNotFound` |

---

## 5. Checkout, manual orders & payment lifecycle

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 5.1 | Empty cart checkout | Can't checkout nothing | `POST /payments/checkout` with empty cart | `400 payment.cartEmpty` |
| 5.2 | Double checkout while one is pending | Only one pending checkout/order per user | Checkout once (leaves a `pending` payment), checkout again | `409 payment.checkoutPending` |
| 5.3 | Resume checkout | Re-enter the same Stripe session instead of creating a new one | `POST /payments/checkout/resume` after 5.2 | `200`, same `paymentId`/`orderId`, fresh/re-used `redirectUrl` |
| 5.4 | Resume after reservation expired | Stale checkout should self-clean | Wait past `RESERVATION_TTL_MS.checkout` (30 min — or temporarily lower it in `reservation.constants.ts` for local testing) then resume | `400 reservation.expired`, and the payment/order/reservation are now cancelled (verify via admin `GET /payments/:id`) |
| 5.5 | Cancel pending checkout | Releases stock immediately, doesn't wait for TTL | `POST /payments/checkout/cancel` | `200`; `GET /inventory/variants/:variantId/availability` → reserved stock is freed immediately |
| 5.6 | Manual order happy path | Admin-created order for a customer, no cart involved | `POST /orders/manual { customerId, items: [{variantId, quantity}] }` (admin) | `201`; a `payment` with `provider: "manual"`, `status: "pending"` is created; reservation TTL is **48h**, not 30 min |
| 5.7 | Mark manual payment paid | Confirms reservation → SALE movements, marks order paid, clears buyer's cart | `POST /payments/:id/markPaid { "note": "bank transfer received" }` (admin) | `200`; `GET /inventory/variants/:variantId/levels` shows stock decremented; `GET /orders/:id` → `status: "paid"` |
| 5.8 | Mark already-paid/cancelled payment as paid | Idempotency / guard against double-fulfillment | Repeat 5.7's call on the same payment | `400 payment.notPending` |
| 5.9 | Refund a paid Stripe payment | Full-amount only, admin-only, restocks the exact reserved lines | `POST /payments/:id/refund { "reason": "customer request" }` (admin, on a PAID stripe payment) | `200`; `payment.status: "refunded"`; order `status: "refunded"`; stock restored to the **same warehouse(s)** the sale came from (check `GET /inventory/variants/:variantId/movements` for a `return` entry with `referenceType: "refund"`) |
| 5.10 | Refund a manual payment | Manual refunds are allowed (just no external gateway call) | Refund a PAID manual-order payment | `200`, same restock behavior, no `refundReference` |
| 5.11 | Refund a payment twice | Can't refund what's already refunded | Repeat 5.9 | `400 payment.cannotRefund` (status is no longer `paid`) |
| 5.12 | Refund a still-pending payment | Only PAID payments can be refunded | Try refunding a `pending` payment | `400 payment.cannotRefund` |
| 5.13 | Non-admin hits admin routes | Role guard | Call `markPaid`/`refund`/`GET /payments` as a plain `USER` | `403 Forbidden` |

---

## 6. Product/variant deletion guards

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 6.1 | Delete variant with on-hand stock | Can't delete inventory you still have | Ensure stock > 0, `DELETE /products/:productId/variants/:variantId` | `400 product.cannotDeleteVariantWithStock` |
| 6.2 | Delete variant with a pending reservation | Can't delete something someone's mid-checkout for | Add to cart + checkout (leave payment pending, don't pay), then delete the variant | `400 product.cannotDeleteVariantWithPendingReservation` |
| 6.3 | Delete variant with zero stock, zero reservations | Happy path | Damage/sell down to 0, ensure no pending reservation, then delete | `200 OK` |
| 6.4 | Delete a product whose variants still have stock | Guard cascades from product → all its variants | `DELETE /products/:productId` while any variant has stock | `400 product.cannotDeleteProductWithStock` |

---

## 7. Reconciliation & the expiry "rescue" (hardest to test live)

These run on a 1-minute cron (`PaymentReconciliationService`), so testing
them via Postman needs either patience or temporarily shrinking the
constants for a local run:

- `src/modules/inventory/constants/reservation.constants.ts` → lower
  `checkout` TTL to e.g. `2 * 60 * 1000` (2 min).
- `payment-reconciliation.service.ts` → lower `BASE_DELAY_MS`/`RESCUE_GRACE_MS`
  similarly if you want faster feedback (**revert both before committing**).

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 7.1 | Reservation expires with no payment | Normal expiry path | Checkout with Stripe, do nothing, wait past TTL | Within ~1 min after expiry: order → `cancelled`, payment → `expired`, stock released (check availability) |
| 7.2 | Stripe payment stuck pending, webhook never arrives | Reconciliation actively polls Stripe | Checkout with Stripe, pay via the actual Stripe test checkout page (redirectUrl), then **don't** rely on the webhook (e.g. block it) | Within the backoff window, the cron calls `strategy.getStatus()` and flips the payment to `paid`, fulfilling the order — confirm via `GET /payments/:id` |
| 7.3 | Rescue mechanism | A payment that completes at the provider *right as* its reservation is about to expire should still fulfill, not silently drop | With the shortened TTL from above, pay via Stripe's test page in the last few seconds before expiry | Order still ends up `paid` (not `cancelled`); reservation's `expiresAt` was pushed forward by `RESCUE_GRACE_MS` internally — check server logs for the `"rescuing instead of releasing stock"` warning |
| 7.4 | Late PAID signal after already expired/cancelled | Should never be silently dropped | Let a reservation fully expire (past the rescue window too), then manually simulate a late webhook/status (or check logs after a genuinely late Stripe test payment) | Payment stays `expired`; server logs an `ERROR` flagging it for manual admin review (search logs for `"needs manual review"`) — **does not** auto-fulfill |
| 7.5 | Manual-order payments are never "rescued" or polled | Manual has no provider status to check | Create a manual order, let its reservation run past TTL (48h — impractical to wait; instead read the code path / logs) | `tryRescueBeforeExpiry` returns `false` immediately (guard on `strategyRegistry.has(provider)`), no `providerNotSupported` errors in logs |

---

## 8. Suggested Postman Collection Runner flows

For the scenarios that need sequencing (checkout → pay → refund, or
add-to-cart → delete product should fail), build small **folders** in Postman
with requests in order and a couple of `pm.test()` assertions per request
(status code + key response fields), so you can re-run a whole flow with one
click after any backend change:

- **Flow A — Multi-warehouse checkout:** seed stock (2.1, 2.2) → check
  availability (3.1) → checkout past default capacity (3.3) → inspect
  reservation lines.
- **Flow B — Manual order lifecycle:** create manual order (5.6) → mark paid
  (5.7) → refund (5.9) → verify stock restored.
- **Flow C — Cart edge cases:** add item → drop price (4.1) → deactivate
  product (4.3) → damage stock (4.4) → verify all three flags appear
  correctly in one final `GET /cart`.
- **Flow D — Deletion guards:** try deleting a variant with stock (6.1) →
  drain stock → delete succeeds (6.3).
- **Flow E — Catalog images:** category replace (9.1) → product gallery +
  variant gallery (9.3–9.5) → same-file dedup (9.6) → delete variant then
  product and confirm Cloudinary/registry cleanup (9.8).
- **Flow F — Analytics vs stock overview:** summary money (10.1) → refund rate
  (10.2) → topProducts variants (10.3) → lowStock warehouse rows (10.4) vs
  stockOverview (10.5) must return the same count.

---

## 9. Catalog images (Cloudinary)

Cross-reference: [`MEDIA.md`](./MEDIA.md). Auth: ADMIN or MANAGER. Multipart
field is `file` (single) or `files` (bulk). JPEG/PNG/WebP, max 3MB, magic-byte
check (Postman `application/octet-stream` is OK).

Setup: a category, a product, and at least two variants on that product
(so a variant can be deleted without hitting `cannotDeleteLastVariant`).

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 9.1 | Category upload | One image, denormalized URL | `POST /categories/:id/image` form-data `file` | `200`, `image` is a `res.cloudinary.com` URL; GET category returns it |
| 9.2 | Category replace | Re-upload releases the previous original | Upload A, then upload B | `image` is B's URL; `media_assets` for A has `refCount` 0 / row gone if unused |
| 9.3 | Product gallery | JSON create must not set images | `POST /products` with `"images": ["http://x"]` then `POST /products/:id/images` | Create → `400` (unknown field); upload → `images[]` length 1 |
| 9.4 | Product bulk + cap | Max 10 on the gallery | `POST /products/:id/images/bulk` with 2 files, then keep uploading until 11th | First bulk appends; 11th → `400 file.tooManyImages` |
| 9.5 | Variant gallery | Independent of product gallery | `POST /products/:productId/variants/:variantId/images` with a file | Variant `images[]` has the URL; product `images[]` unchanged |
| 9.6 | Same bytes, two entities | Hash dedup, `refCount++` | Upload the same jpg to product and to variant | Same URL/publicId; `media_assets.refCount` is 2 |
| 9.7 | Remove by URL | Release one gallery slot | `DELETE /products/:productId/variants/:variantId/images` `{ "url": "<that url>" }` | Variant gallery no longer has it; product gallery still has it if 9.6 ran |
| 9.8 | Delete variant / product | Galleries released before soft-delete | Drain stock, `DELETE` variant, then `DELETE` product | Variant images gone from registry if unused; product + remaining variant images released |
| 9.9 | Missing Cloudinary env | Fail closed | Unset `CLOUDINARY_*`, restart, upload | `503 file.notConfigured` |

---

## 10. Analytics & stock overview

Auth: ADMIN or MANAGER. Cross-reference: [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) §2 (stock overview), §13 (analytics), §14 (users).

Setup for 10.4–10.5: one variant with **2** available in warehouse A and **5** in warehouse B (and nothing else ≤ 5 except a separate SKU with **0**).

| # | Scenario | Rule | Steps | Expected |
|---|---|---|---|---|
| 10.1 | Summary has no netRevenue | Refunds already left the paid bucket | `GET /analytics/summary` with 9 paid + 1 refunded payment | `money[].grossRevenue` = paid sum only; `refundedAmount` = refund sum; **no** `netRevenue` field |
| 10.2 | Refund rate uses captured money | Rate is refunded ÷ (paid + refunded) | Same data as 10.1, `GET /analytics/refunds` | `refundRate` ≈ `refundedAmount / (grossRevenue + refundedAmount)`, 4 decimals, not `refunded / gross` |
| 10.3 | Top products nest variants | One list, not two routes | `GET /analytics/topProducts?limit=10` | Each product has `variants[]` (sku, unitsSold, revenue). `GET /analytics/topVariants` → **404** |
| 10.4 | Low stock is per warehouse | `available ≤ threshold` including 0 | `GET /analytics/lowStock?threshold=5` | **3 rows** if data is 0 + 2 + 5 (same SKU twice, two warehouses). Soft-deleted SKUs absent |
| 10.5 | Stock overview matches that grain | Same filter, same row count | `GET /products/stockOverview?stockState=lowStock&threshold=5` | Same **3** rows as 10.4; iPhone-like SKU is **two** lines (Available 2 and 5), not one with 7 |
| 10.6 | Segments vs top customers | Counts vs spender list | `GET /analytics/customerSegments?from=` last month vs `GET /analytics/topCustomers` | Segments: `newCustomers` + `returningCustomers` = `totalBuyersInWindow`. Top customers: `spend` / `orderCount`, **no** `returningCustomers` |
| 10.7 | Storefront hides internals | Public catalog | `GET /products/storefront` (no auth) | Active products/variants only; `available` present; no reserved/warehouse/deletedAt |
| 10.8 | Profile vs admin user write | Role is admin-only | As USER: `PATCH /users/profile { "name": "A" }` then `PATCH /users/:ownId { "role": "admin" }` | Profile `200`; admin-style patch on `:id` → **403**. `GET /users/customers` as MANAGER → USER roles only |
