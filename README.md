# NestJS E-commerce Backend

Production-grade e-commerce backend built with **NestJS**, **MongoDB (Mongoose)**, and **TypeScript**. Multi-warehouse inventory with an append-only stock ledger, reservation-based checkout, and pluggable payment providers (Stripe, manual bank transfer).

All endpoints are served under the global prefix **`/api/v1`** (default port `8000`).

## Tech stack

| Concern          | Choice                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| Framework        | NestJS 10 (controller → service → repository)                                       |
| Database         | MongoDB + Mongoose 8 (**replica set required** — transactions)                      |
| Auth             | JWT access + Redis-backed refresh sessions (cookies) + Google OAuth 2.0, role guard |
| Cache / sessions | Redis 7 (`ioredis`, `REDIS_URL`)                                                    |
| Payments         | Stripe (redirect + webhook), manual (admin proof) — refunds + reconciliation on top |
| Scheduling       | BullMQ job scheduler — payment reconciliation every 60s                             |
| Jobs             | BullMQ — `email` + `payment-reconciliation`                                         |
| i18n             | nestjs-i18n — API messages in `en` / `de`, localized content fields                 |
| Email            | Nodemailer (order/payment notifications)                                            |
| Validation       | class-validator via `I18nValidationPipe` (whitelist + forbid unknown)               |

## Modules

| Module              | Path                                             | Responsibility                                                                                          |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Auth                | `src/modules/auth/`                              | Register/login, JWT + Redis refresh sessions, Google OAuth                                              |
| Redis               | `src/redis/`                                     | Shared Redis client (`REDIS_URL`); auth sessions today, queues later                                    |
| Users               | `src/modules/users/`                             | Profiles, roles (customer / staff / admin)                                                              |
| Categories / Brands | `src/modules/categories/`, `src/modules/brands/` | Catalog taxonomy                                                                                        |
| Products            | `src/modules/products/`                          | Catalog entity + **variants** (SKU, barcode, options matrix, default variant)                           |
| Warehouses          | `src/modules/warehouses/`                        | Locations, single default warehouse, transfers between sites                                            |
| Inventory           | `src/modules/inventory/`                         | Append-only movement ledger, per-warehouse levels, **reservations**                                     |
| Cart                | `src/modules/cart/`                              | Per-user cart with live availability + price-drift flags, quantity caps, conflict-safe writes           |
| Orders              | `src/modules/orders/`                            | Line items + totals + status (source of truth for "what was bought")                                    |
| Payments            | `src/modules/payments/`                          | Checkout orchestration, webhooks, admin mark-paid/refund, provider strategies, scheduled reconciliation |
| Reviews             | `src/modules/reviews/`                           | Product reviews, denormalized rating on product                                                         |
| Articles            | `src/modules/articles/`                          | CMS-style content                                                                                       |
| Files upload        | `src/modules/files-upload/`                      | Image upload with magic-byte validation                                                                 |
| Notifications       | `src/modules/notifications/`                     | Email delivery                                                                                          |

## How the commerce core works

```
checkout / manual order
        │  one Mongo transaction
        ▼
Order (pending_payment) + Payment (pending) + Reservation (pending, per-warehouse lines)
        │                                        holds stock: reservedQuantity ↑
        ▼
payment settles (webhook / admin mark-paid)
        │  one Mongo transaction
        ▼
Reservation confirmed → sale movements (ledger) → levels ↓ → variant.stock ↓
Order → paid
```

Key invariants (full list in [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md)):

- `variant.stock` is a **cache** = sum of `inventory_levels.quantity` across warehouses.
- Every stock change goes through `InventoryService.postMovement` — one ledger row per change, idempotent on `(referenceType, referenceId, variant, type, warehouse)`.
- `available = quantity − reservedQuantity` per warehouse; reservations hold stock with atomic conditional updates (no oversell under concurrency).
- Reservations expire lazily on confirm, and proactively via a cron sweep (`PaymentReconciliationService`, every minute) that also re-polls Stripe (with backoff) for payments a webhook never reached.
- Line items live only on the **Order**; Payment links to the order.
- Refunds (admin, full-amount, Stripe/Manual) restock the exact reservation lines sold — same variant, same warehouse.

## Project docs

- [Business Rules](docs/BUSINESS_RULES.md) — invariants and rules for Products & Variants, Warehouses, Inventory, Reservations, Orders, Payments. **Read before touching those modules.**

## Getting started

### Prerequisites

- Node.js 20+
- MongoDB running as a **replica set** (transactions are used throughout — a standalone `mongod` will fail). For local dev a single-node replica set is enough:

```bash
mongod --replSet rs0 --dbpath <your-db-path>
# once, in mongosh:
rs.initiate()
```

### Install & configure

```bash
npm install
cp .env.example .env.development   # fill in the values below
```

Environment files are loaded per `NODE_ENV`: `.env.development` / `.env.production`.

| Variable                                                                        | Purpose                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `MONGO_URI`                                                                     | e.g. `mongodb://localhost:27017/ecommerce?replicaSet=rs0` |
| `PORT`                                                                          | API port (default `8000`)                                 |
| `JWT_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRE`          | Token config                                              |
| `COOKIE_SECURE`                                                                 | `true` in production (HTTPS)                              |
| `FRONTEND_URL`                                                                  | CORS origin (default `http://localhost:3000`)             |
| `DEFAULT_LANGUAGE`                                                              | Fallback locale (`de`)                                    |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_SENDER_NAME` | SMTP for notifications                                    |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`               | Google OAuth (optional)                                   |
| `DELIVERY_FEE`                                                                  | Flat delivery fee added at checkout (default `70`)        |
| `PAYMENT_DEFAULT_CURRENCY`                                                      | Default currency (`EUR`)                                  |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_CANCEL_URL`, `PAYMENT_CALLBACK_BASE_URL`        | Redirect / webhook base URLs                              |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                    | Stripe                                                    |

### Seed order (first run)

1. Create an admin user, categories/brands as needed.
2. **Create a warehouse** — the first one automatically becomes the default. Checkout and variant creation with opening stock will fail without it.
3. Create products + variants (opening stock is posted to the default warehouse through the inventory ledger).

### Run

```bash
npm run start:dev    # watch mode (NODE_ENV=development)
npm run start:prod   # compiled (NODE_ENV=production, run npm run build first)
```

## API overview

All routes below are relative to `/api/v1`. Most write endpoints require a staff/admin role; guards are global (JWT + roles), public routes are opt-in.

| Area          | Routes (examples)                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `POST /auth/register`, `POST /auth/login`, `GET /auth/google`, `GET /auth/google/callback`                                                               |
| Products      | `GET/POST /products` (`?search=` → title/desc/slug + variant sku/barcode), `GET /products/stock-overview` (admin), variants bulk/reorder                 |
| SEO           | `GET /seo/sitemap`, `GET /seo/{products\|categories\|brands\|articles}/:slug` (public meta for FE)                                                       |
| Warehouses    | `GET/POST/PATCH/DELETE /warehouses`                                                                                                                      |
| Inventory     | `POST /inventory/movements` (restock/return/adjustment/damage), `POST /inventory/transfers`, `GET /inventory/levels/...`, `GET /inventory/movements/...` |
| Cart          | `GET/POST/PATCH/DELETE /cart` (availability-checked)                                                                                                     |
| Wishlist      | `GET /wishlist`, `POST /wishlist/items`, `DELETE /wishlist/items/:variantId`, `POST /wishlist/items/:variantId/move-to-cart`, `DELETE /wishlist`         |
| Checkout      | `POST /payments/checkout`, `POST /payments/checkout/resume`, `POST /payments/checkout/cancel`                                                            |
| Webhooks      | `POST /payments/webhook/:provider` (raw body, signature-verified)                                                                                        |
| Manual orders | `POST /orders/manual` (admin), `POST /payments/:id/markPaid` (admin, with proof images/note)                                                             |
| Refunds       | `POST /payments/:id/refund` (admin, full amount, Stripe/Manual only)                                                                                     |
| Orders        | `GET /orders/my`, `GET /orders` (staff), `GET /orders/:id`                                                                                               |

Localization: pass `?lang=en`, `Accept-Language`, or `x-lang` header. Responses are wrapped by a global `data` envelope interceptor.

## Tooling

```bash
npm run lint      # eslint --fix
npm run format    # prettier
```

No test suite exists yet (`jest`/`test:e2e` scripts are present from the Nest CLI template but there are no `*.spec.ts` files in the repo).

## Roadmap

Done: product hardening, variants, inventory ledger, multi-warehouse, reservations/allocation, orders + payments orchestration, cart hardening, payments hardening (refunds, reconciliation sweep with backoff), product search (`GET /products?search=` matches title/description/shortDescription/slug **and** variant sku/barcode; regex input is escaped), SEO (nested `seo` on product/category/brand/article; public `GET /seo/sitemap` + per-slug resolve), wishlist (per-user variant list, move-to-cart), auth + Redis refresh sessions (multi-device `sid` in Redis; logout/password revoke).

Next: audit log → analytics → observability (Pino, OpenTelemetry).

**Queues (done):** email delivery via BullMQ + templates; payment reconciliation via BullMQ `upsertJobScheduler` every 60s (replaced `@Cron`). Redis owns the timer so multiple app instances share one sweep.

### Redis (local)

Refresh sessions need a running Redis. Easiest on Windows:

```bash
docker compose up -d redis
```

Set in `.env.development`:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Then start the API as usual (`npm run start:dev`). App boot fails if Redis is unreachable — that is intentional so auth sessions cannot silently fall back to Mongo.

**Parked (safe to skip for now):** timed-sale pricing and coupons. Cart/checkout already charge via `resolveVariantUnitPrice` on flat `price` / `priceAfterDiscount`. Sale windows and coupon codes can be added later without redesigning payments or inventory — they plug into that same price helper (pricing) or adjust checkout subtotal after unit prices are resolved (coupons).

**Note:** Payment reconciliation runs as a BullMQ repeatable job (`every: 60_000`). Redis holds the scheduler id so multiple app instances share one timer instead of each firing `@Cron`. Inner payment backoff (`reconciliationAttempts`) is unchanged. Observability later can add sweep metrics.
