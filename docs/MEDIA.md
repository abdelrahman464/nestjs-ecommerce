# Media — images on catalog entities

Images are **never** accepted on JSON create/update bodies. Attach them with
multipart upload endpoints on the resource that owns them. There is **no**
generic dump endpoint (`POST /files-upload/...` does not exist).

Storefront reads denormalized URLs already on the document:

| Entity | Field | Cardinality |
|---|---|---|
| Category | `image` | one |
| Product | `images[]` | gallery, max 10 |
| Product variant | `images[]` | gallery, max 10 |

Internal Cloudinary `public_id`s live on `imagePublicId` / `imagePublicIds[]`
(`select: false`) and are never returned to clients.

Full catalog invariants: [`BUSINESS_RULES.md`](./BUSINESS_RULES.md).
Manual checks: [`TEST_SCENARIOS.md`](./TEST_SCENARIOS.md) §9.

---

## Architecture

```
HTTP (categories / products / variants controllers)
        │  multipart `file` or `files`
        ▼
EntityMediaService     attach / detach; persist via repository mediaStore()
        │  acquire before persist, release after persist
        ▼
MediaService           SHA-256 → media_assets registry → refCount
        │
        ▼
ObjectStorage port     CloudinaryStorage adapter (only Cloudinary coupling)
```

| Layer | Path | Role |
|---|---|---|
| HTTP | resource controllers | Auth + `IMAGE_UPLOAD_PIPE`; no storage logic |
| `EntityMediaService` | `src/modules/media/entity-media.service.ts` | Single image or gallery; DB via repository `mediaStore()` |
| `MediaService` | `src/modules/media/media.service.ts` | Dedup + ref-counted lifecycle |
| `ObjectStorage` | `src/modules/media/storage/` | Port; swap S3 later without touching catalog |
| Registry | collection `media_assets` | One row per unique original |

Rules:

1. Hash the bytes first (`CryptoService.createSha256Hash`). Identical file →
   increment `refCount`, skip Cloudinary.
2. Store **one compressed original** at public id `nest-ecommerce/assets/{sha256}`
   (`quality: auto:good`). Thumbnails are Cloudinary URL transforms on read
   (`f_auto,q_auto,w_800`), not extra stored files.
3. Destroy the remote object **only** when `refCount` hits 0.
4. Same file already on the **same** entity → extra ref is undone (no-op).
5. Parent delete releases stored refs (`destroySingleStored` /
   `destroyGalleryStored`) then soft-deletes the document. Do not parse
   `publicId` from URLs.

---

## Environment

From [cloudinary.com](https://cloudinary.com) → Dashboard → API Keys. Put them
in `.env.development` (never commit secrets):

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Missing credentials: boot succeeds, but the first upload returns **503**
`file.notConfigured`.

---

## Validation

`IMAGE_UPLOAD_PIPE` (`src/modules/media/media.constants.ts`):

- Max size **3MB**
- Types: **jpeg / png / webp**
- Gate is **magic bytes** (`FileSignatureValidator`), not the client
  `Content-Type`. Postman often sends `application/octet-stream`; that is fine.

---

## HTTP API

All paths are under `/api/v1`. Writes: **ADMIN** or **MANAGER**.
Auth is cookie-based (`POST /auth/login`); Postman cookie jar is enough.

### Category — one image

| Method | Path | Body |
|---|---|---|
| `POST` | `/categories/:id/image` | form-data field **`file`** |
| `DELETE` | `/categories/:id/image` | — |

Re-upload replaces the previous image and releases the old asset.

### Product — gallery

| Method | Path | Body |
|---|---|---|
| `POST` | `/products/:id/images` | form-data field **`file`** |
| `POST` | `/products/:id/images/bulk` | form-data field **`files`** (max 10 in one request) |
| `DELETE` | `/products/:id/images` | JSON `{ "url": "https://res.cloudinary.com/..." }` (or `?url=`) |

Max **10** images on the product. Deleting a product releases the product
gallery **and** every variant gallery.

### Variant — gallery

| Method | Path | Body |
|---|---|---|
| `POST` | `/products/:productId/variants/:variantId/images` | form-data **`file`** |
| `POST` | `/products/:productId/variants/:variantId/images/bulk` | form-data **`files`** |
| `DELETE` | `/products/:productId/variants/:variantId/images` | JSON `{ "url": "..." }` (or `?url=`) |

Max **10** images per variant. Independent of the parent product gallery.
Deleting a variant releases its gallery.

`POST /products` and `POST /products/:id/variants` **must not** include
`images`. Unknown fields are rejected by the validation pipe.

---

## Postman / curl

Login first (`POST /auth/login`) so cookies are set.

**Category**

```
POST {{URL}}/categories/{{categoryId}}/image
Body → form-data → key `file` (type File) → jpg/png/webp
```

```bash
curl -X POST "http://localhost:8000/api/v1/categories/CATEGORY_ID/image" \
  -H "Cookie: accessToken=ADMIN_JWT" \
  -F "file=@./photo.jpg"
```

Response includes `image: "https://res.cloudinary.com/..."`. Open that URL.

**Product**

```
POST {{URL}}/products/{{productId}}/images
form-data → `file`

POST {{URL}}/products/{{productId}}/images/bulk
form-data → `files` (repeat the key for each file)

DELETE {{URL}}/products/{{productId}}/images
{ "url": "https://res.cloudinary.com/..." }
```

**Variant** (color/size photos on the SKU, not the marketing product)

```
POST {{URL}}/products/{{productId}}/variants/{{variantId}}/images
form-data → `file`

POST {{URL}}/products/{{productId}}/variants/{{variantId}}/images/bulk
form-data → `files`

DELETE {{URL}}/products/{{productId}}/variants/{{variantId}}/images
{ "url": "https://res.cloudinary.com/..." }
```

`GET /products/:id` and `GET /products/:productId/variants` then show `images[]`.

---

## Errors (i18n `file.*`)

| Status | Key | When |
|---|---|---|
| 400 | `file.empty` | Empty buffer or bulk with no files |
| 400 | `file.tooManyImages` | Gallery already at 10 |
| 400 | `file.imageUrlRequired` | DELETE without `url` |
| 404 | `file.imageNotFound` | URL is not on that gallery |
| 415 / 422 | pipe | Wrong type or over 3MB |
| 503 | `file.notConfigured` | Missing `CLOUDINARY_*` |
| 502 | `file.uploadFailed` | Cloudinary put failed |

---

## Storefront thumbs

The stored URL is the original. Resize on read, for example:

`https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,w_800/<public_id>`
