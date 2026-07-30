# Product Variants

Enterprise catalog model for this NestJS + MongoDB ecommerce API.

**Base URL:** `/api/v1`  
**Collections:** `products`, `product_variants`

---

## Table of contents

1. [Concepts](#1-concepts)
2. [Architecture](#2-architecture)
3. [Data model](#3-data-model)
4. [Business rules](#4-business-rules)
5. [Indexes](#5-indexes)
6. [API reference](#6-api-reference)
7. [Postman examples](#7-postman-examples)
8. [Flows](#8-flows)
9. [Cart & payments](#9-cart--payments)
10. [Error messages](#10-error-messages)
11. [File map](#11-file-map)
12. [Ops notes](#12-ops-notes)

---

## 1. Concepts

| Term | Meaning |
|------|---------|
| **Product** | Marketing / catalog page (title, description, category, brand, images) |
| **Variant** | Sellable unit (SKU, barcode, price, stock) |
| **Option type** | Limited axis: `color`, `size`, `weight`, `material`, `brand`, `model` |
| **Option value** | Value under a type, e.g. `red`, `48` |
| **optionDefinitions** | Product-level list of types + allowed values (admin UI + validation) |
| **groupBy** | Which option type the admin table groups by (**display only**) |
| **options** | Map on a variant, e.g. `{ color: "red", size: "48" }` |
| **optionsKey** | Server-generated fingerprint for uniqueness (never sent by client) |
| **isDefault** | Exactly one live default variant per product (fallback / first sellable) |

### Design choices

- Variants live in a **separate collection** (not embedded) for stock concurrency and cart references.
- Option types are a **fixed enum** (max **3** types per product).
- Multiple types are allowed together (color **and** size **and** weight) → combinations become variants.
- `groupBy` does **not** change variant data; it only affects how an admin UI nests the matrix.

---

## 2. Architecture

```text
Client / Admin UI
        │
        ▼
┌───────────────────────┐
│ ProductsController    │  /products
│ ProductVariantsController │  /products/:productId/variants
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ ProductsService       │
│ ProductVariantsService│
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ ProductRepository     │  → products
│ ProductVariantRepository │  → product_variants
└───────────────────────┘
```

**Ownership split**

| Lives on Product | Lives on Variant |
|------------------|------------------|
| title, slug, description | sku, barcode |
| category, brand | price, priceAfterDiscount |
| images (gallery) | stock, unit |
| optionDefinitions, groupBy | options, optionsKey |
| status (catalog visibility) | status (sellable availability) |
| ratings, banner, order | isDefault, order |

Cart and checkout always use **`variantId`**, not productId.

---

## 3. Data model

### Product (relevant fields)

```ts
{
  category: ObjectId,
  brand?: ObjectId,
  title: { en, de },      // i18n
  slug: string,
  description: { en, de },
  images: string[],
  status: 'active' | 'inactive' | 'outOfStock',
  optionDefinitions: [
    { type: 'color', values: ['red', 'blue'], order: 0 }
  ],
  groupBy: 'color' | null,
  deletedAt: Date | null
}
```

### ProductVariant

```ts
{
  product: ObjectId,
  sku: string,              // uppercase, globally unique (live rows)
  barcode: string,          // globally unique (live rows)
  options: { color: 'red', size: '48' },  // or {}
  optionsKey: 'color:red|size:48',        // derived
  price: number,
  priceAfterDiscount: number,
  stock: number,
  unit: 'piece' | 'm2' | 'kg' | 'liter' | 'box',
  status: 'active' | 'inactive' | 'outOfStock',
  isDefault: boolean,
  order: number,
  deletedAt: Date | null
}
```

### optionsKey

Built by `buildOptionsKey()`:

- Keys/values normalized (trim, lowercase for fingerprint)
- Keys sorted alphabetically
- Empty options → `__default__`
- Example: `{ size: "48", color: "Red" }` → `color:red|size:48`

Used for unique index `{ product, optionsKey }` so the same combination cannot be created twice on one product.

---

## 4. Business rules

### Product

1. Creating a product **always** creates at least one **default variant** (`defaultVariant` in body).
2. Soft-deleting a product soft-deletes **all** its variants (transaction).
3. Canonical title uniqueness uses `DEFAULT_CONTENT_LOCALE` (currently `en`) with partial unique index (`deletedAt: null`).
4. Max **3** option types per product.
5. No duplicate option types on one product.
6. `groupBy` must be one of the defined types (or `null` if no definitions). Changing `groupBy` does **not** modify variants.
7. Updating `optionDefinitions` is rejected if existing variants would become invalid.

### Variant

1. `options` must match `optionDefinitions` (all types required when definitions exist; values must be allowed).
2. If product has **no** `optionDefinitions`, `options` must be empty.
3. `priceAfterDiscount <= price`.
4. Cannot set `status: active` when `stock <= 0` (status is resolved from stock).
5. SKU and barcode unique among non-deleted variants (global).
6. Exactly one live `isDefault: true` per product (enforced by partial unique index + service).
7. Cannot set `isDefault: false` on the **current** default — mark another variant as default first.
8. Setting `isDefault: true` on another variant clears the previous default.
9. Cannot soft-delete the **last** remaining variant of a product.
10. Soft-deleting the default promotes another remaining variant to default.
11. Nested routes require variant to belong to the path `productId` (`findByIdAndProduct`).

### Bulk create

1. All-or-nothing **transaction** (`insertMany`).
2. Duplicates **inside the same request** → `400` (“duplicated in this request”).
3. Duplicates **already in DB** → `409` (“already exists”).
4. At most one `isDefault: true` in the bulk payload.

---

## 5. Indexes

### `product_variants`

| Index | Type | Purpose |
|-------|------|---------|
| `{ product, order }` | partial `deletedAt: null` | List / sort by product |
| `{ sku }` | unique partial | Global SKU |
| `{ barcode }` | unique partial | Global barcode |
| `{ product, optionsKey }` | unique partial | No duplicate combo |
| `{ product }` where `isDefault: true` | unique partial | One default |
| `{ product, status }` | partial | Filter active |

### Soft delete + uniqueness

`partialFilterExpression: { deletedAt: null }` means soft-deleted rows do **not** block reuse of title/sku/barcode.

---

## 6. API reference

Auth: JWT / cookies as configured.  
Roles: **ADMIN** / **MANAGER** for writes (unless noted). **Public** for reads.

### Products (variant-related)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/products` | Admin/Manager | Create product + default variant |
| PATCH | `/products/:id` | Admin/Manager | Update product (incl. optionDefinitions / groupBy) |
| DELETE | `/products/:id` | Admin | Soft-delete product + variants |
| GET | `/products` | Public | List (default `status=active`; `?status=all` for all) |
| GET | `/products/:id` | Public | Get product |
| GET | `/products/slug/:slug` | Public | Get by slug |

### Variants

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products/:productId/variants` | Public | List variants |
| GET | `/products/:productId/variants/:variantId` | Public | Get one variant |
| POST | `/products/:productId/variants` | Admin/Manager | Create one variant |
| POST | `/products/:productId/variants/bulk` | Admin/Manager | Bulk create (transaction) |
| PATCH | `/products/:productId/variants/reorder` | Admin/Manager | Reorder |
| PATCH | `/products/:productId/variants/:variantId` | Admin/Manager | Update |
| DELETE | `/products/:productId/variants/:variantId` | Admin | Soft-delete |

### Cart (uses variant)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cart/items` | Body: `{ variantId, quantity }` |
| PATCH | `/cart/items/:variantId` | Update quantity |
| DELETE | `/cart/items/:variantId` | Remove line |

---

## 7. Postman examples

### A) Simple product (no options)

`POST /api/v1/products`

```json
{
  "category": "CATEGORY_OBJECT_ID",
  "title": { "en": "Basic Mug", "de": "Einfacher Becher" },
  "description": { "en": "Ceramic mug", "de": "Keramikbecher" },
  "defaultVariant": {
    "sku": "MUG-001",
    "barcode": "5901234123457",
    "price": 15,
    "priceAfterDiscount": 12,
    "stock": 100,
    "unit": "piece"
  }
}
```

### B) Product with options + first variant

`POST /api/v1/products`

```json
{
  "category": "CATEGORY_OBJECT_ID",
  "title": { "en": "T-Shirt", "de": "T-Shirt" },
  "description": { "en": "Cotton tee", "de": "Baumwollshirt" },
  "optionDefinitions": [
    { "type": "color", "values": ["red", "blue", "black"], "order": 0 },
    { "type": "size", "values": ["48", "50"], "order": 1 },
    { "type": "weight", "values": ["1000", "200"], "order": 2 }
  ],
  "groupBy": "color",
  "defaultVariant": {
    "sku": "TS-RED-48-1000",
    "barcode": "1111111111111",
    "price": 200,
    "stock": 10,
    "options": {
      "color": "red",
      "size": "48",
      "weight": "1000"
    }
  }
}
```

If `optionDefinitions` is set, `defaultVariant.options` must include **every** type with a valid value.

### C) Add one variant

`POST /api/v1/products/{{PRODUCT_ID}}/variants`

```json
{
  "sku": "TS-RED-48-200",
  "barcode": "1111111111112",
  "price": 180,
  "stock": 5,
  "options": {
    "color": "red",
    "size": "48",
    "weight": "200"
  }
}
```

### D) Bulk create variants

`POST /api/v1/products/{{PRODUCT_ID}}/variants/bulk`

```json
{
  "variants": [
    {
      "sku": "TS-BLUE-50-1000",
      "barcode": "1111111111113",
      "price": 200,
      "stock": 8,
      "options": { "color": "blue", "size": "50", "weight": "1000" }
    },
    {
      "sku": "TS-BLACK-48-200",
      "barcode": "1111111111114",
      "price": 190,
      "stock": 3,
      "options": { "color": "black", "size": "48", "weight": "200" }
    }
  ]
}
```

### E) Change default variant

`PATCH /api/v1/products/{{PRODUCT_ID}}/variants/{{OTHER_VARIANT_ID}}`

```json
{ "isDefault": true }
```

Do **not** send `{ "isDefault": false }` on the current default — API returns 400.

### F) Reorder

`PATCH /api/v1/products/{{PRODUCT_ID}}/variants/reorder`

```json
{
  "items": [
    { "variantId": "VARIANT_ID_1", "order": 0 },
    { "variantId": "VARIANT_ID_2", "order": 1 }
  ]
}
```

### G) Change groupBy only (UI)

`PATCH /api/v1/products/{{PRODUCT_ID}}`

```json
{ "groupBy": "size" }
```

Variants are unchanged; only admin grouping changes.

### H) Add to cart

`POST /api/v1/cart/items`

```json
{
  "variantId": "VARIANT_ID",
  "quantity": 2
}
```

---

## 8. Flows

### Create product

```text
POST /products
  → validate category/brand, title, optionDefinitions/groupBy
  → transaction:
       insert product
       insert default variant (sku, barcode, price, stock, options)
  → return product
```

### Create / bulk variants

```text
validate options against optionDefinitions
normalize options → optionsKey
check sku/barcode (request + DB)
transaction (bulk): insertMany
```

### Soft-delete product

```text
transaction:
  soft-delete all variants
  soft-delete product
```

### Soft-delete variant

```text
block if last variant
soft-delete
if was default → promote another remaining variant
```

---

## 9. Cart & payments

- Cart line items store **`variant`** (ObjectId → `product_variants`).
- Availability uses variant `status` + `stock`, and parent product must not be inactive/deleted.
- Checkout prices from variant (`priceAfterDiscount` if > 0, else `price`).
- Fulfillment decrements **variant** stock (and may set variant `outOfStock`).

---

## 10. Error messages (keys)

| Key | When |
|-----|------|
| `product.skuAlreadyExists` | SKU already in DB |
| `product.barcodeAlreadyExists` | Barcode already in DB |
| `product.skuDuplicateInRequest` | Same SKU twice in bulk body |
| `product.barcodeDuplicateInRequest` | Same barcode twice in bulk body |
| `product.variantCombinationExists` | Combo already in DB |
| `product.variantCombinationDuplicateInRequest` | Same combo twice in bulk body |
| `product.cannotUnsetDefaultVariant` | `isDefault: false` on current default |
| `product.multipleDefaultVariants` | >1 default in bulk payload |
| `product.cannotDeleteLastVariant` | Deleting last variant |
| `product.missingOptionType` / `invalidOptionValue` | Options don’t match definitions |
| `product.invalidGroupBy` | groupBy not in optionDefinitions |
| `product.optionDefinitionsConflict` | New definitions break existing variants |

i18n files: `src/i18n/en/product.json`, `src/i18n/de/product.json`.

---

## 11. File map

```text
src/modules/products/
  enums/product-option-type.enum.ts
  schemas/product.schema.ts
  schemas/product-option-definition.schema.ts
  schemas/product-variant.schema.ts
  utils/options-key.util.ts
  utils/product-status.util.ts
  dto/create-product.dto.ts          # includes defaultVariant
  dto/create-product-variant.dto.ts
  dto/bulk-create-product-variants.dto.ts
  dto/update-product-variant.dto.ts
  dto/reorder-variants.dto.ts
  repository/products.repository.ts
  repository/product-variants.repository.ts
  products.service.ts
  product-variants.service.ts
  products.controller.ts
  product-variants.controller.ts
  products.module.ts
```

---

## 12. Ops notes

1. **MongoDB replica set** required for transactions (product create, variant bulk, reorder, product delete). Atlas is fine; local standalone may fail.
2. After migrating from product-level `sku`/`price`/`stock`, drop old unique indexes on `products` if they still exist.
3. Existing legacy product documents without variants need a one-time migration (create default variant from old fields) before cart/checkout will work for them.
4. `DEFAULT_CONTENT_LOCALE` is index `0` of `SUPPORTED_CONTENT_LOCALES` — change carefully; uniqueness indexes depend on it.

---

## Quick mental model

```text
Product  = what you browse
Variant  = what you buy
groupBy  = how admin tables are grouped
optionsKey = DB uniqueness of a combination
Cart     = variantId + quantity
```
