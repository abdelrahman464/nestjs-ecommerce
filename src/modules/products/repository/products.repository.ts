import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, PipelineStage, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  localizedPath,
  localizedSearchPaths,
  resolveRequestContentLocale,
} from '../../../common/constants/supported-content-locales.constant';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { escapeRegex } from '../../../common/utils/escape-regex.util';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { generateUniqueSlug as buildUniqueSlug } from '../../../common/utils/slug.util';
import {
  EntityMediaStore,
  mongooseMediaStore,
} from '../../media/entity-media.store';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { BRAND_PUBLIC_FIELDS } from '../../brands/constants/brand.constants';
import { CATEGORY_PUBLIC_FIELDS } from '../../categories/constants/category.constants';
import {
  PRODUCT_DEFAULT_SORT,
  PRODUCT_SEARCH_FIELDS,
} from '../constants/product.constants';
import { CreateProductPersistence } from '../dto/create-product.dto';
import { ReorderProductItemDto } from '../dto/reorder-products.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';
import { Product, ProductDocument } from '../schemas/product.schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../schemas/product-variant.schema';

const NOT_DELETED = { deletedAt: null };

/** One warehouse row inside a variant's stock breakdown. */
export type WarehouseStockRow = {
  warehouseId: Types.ObjectId;
  warehouseName?: string;
  warehouseCode?: string;
  onHand: number;
  reserved: number;
  available: number;
};

/** One variant with its stock numbers (totals + per-warehouse breakdown). */
export type VariantStockOverview = {
  _id: Types.ObjectId;
  sku: string;
  barcode: string;
  price: number;
  priceAfterDiscount: number;
  status: string;
  isDefault: boolean;
  /** Cached counter on the variant doc — must always equal `onHand`. */
  stock: number;
  onHand: number;
  reserved: number;
  available: number;
  byWarehouse: WarehouseStockRow[];
};

/** One product with all its variants and stock rolled up. */
export type ProductStockOverview = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  status: string;
  variantsCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  variants: VariantStockOverview[];
};

/** Customer-safe variant: prices + live available units, no warehouse/reserved. */
export type StorefrontVariant = {
  _id: Types.ObjectId;
  sku: string;
  price: number;
  priceAfterDiscount: number;
  status: string;
  isDefault: boolean;
  options: Record<string, string>;
  unit: string;
  order: number;
  images: string[];
  available: number;
};

export type StorefrontCategory = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  image?: string;
};

export type StorefrontBrand = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  logo?: string;
};

export type StorefrontProduct = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  images: string[];
  category: StorefrontCategory | null;
  brand: StorefrontBrand | null;
  showOnBanner: boolean;
  ratingsAverage: number;
  ratingsQuantity: number;
  totalAvailable: number;
  variants: StorefrontVariant[];
};

function parseObjectId(value: unknown): Types.ObjectId | undefined {
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    return undefined;
  }
  return new Types.ObjectId(value);
}

function parseNonNegativeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseDateRange(
  value: unknown,
): Record<string, Date> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const src = value as Record<string, unknown>;
  const range: Record<string, Date> = {};
  for (const op of ['gte', 'gt', 'lte', 'lt'] as const) {
    const parsed = parseDate(src[op]);
    if (parsed) range[`$${op}`] = parsed;
  }
  return Object.keys(range).length ? range : undefined;
}

function parseProductStatus(value: unknown): ProductStatus | undefined {
  if (typeof value !== 'string' || value === 'all') return undefined;
  return (Object.values(ProductStatus) as string[]).includes(value)
    ? (value as ProductStatus)
    : undefined;
}

function parseProductUnit(value: unknown): ProductUnit | undefined {
  if (typeof value !== 'string') return undefined;
  return (Object.values(ProductUnit) as string[]).includes(value)
    ? (value as ProductUnit)
    : undefined;
}

@Injectable()
export class ProductRepository {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariantDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  mediaStore(): EntityMediaStore {
    return mongooseMediaStore(this.productModel);
  }

  private static readonly populate = [
    { path: 'category', select: CATEGORY_PUBLIC_FIELDS },
    { path: 'brand', select: BRAND_PUBLIC_FIELDS },
  ];

  /**
   * Storefront / admin product list.
   *
   * When `?search=` is present, matches:
   * - product title / description / shortDescription (all locales) + slug
   * - OR any non-deleted variant whose sku / barcode contains the keyword
   *
   * Variant matches still return the **product** (list shape unchanged —
   * no variants embedded). SKU/barcode live on another collection, so we
   * resolve matching product ids first, then OR them into the product $match.
   */
  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const params: Record<string, any> = {
      ...queryParams,
      sort: queryParams.sort ?? PRODUCT_DEFAULT_SORT,
    };

    const keyword =
      typeof params.search === 'string' && params.search.trim()
        ? params.search.trim()
        : undefined;

    let baseFilter: Record<string, unknown> = { ...NOT_DELETED };

    if (keyword) {
      const regex = new RegExp(escapeRegex(keyword), 'i');

      // Products whose variants match sku/barcode (distinct product ids).
      const variantProductIds = await this.variantModel.distinct('product', {
        ...NOT_DELETED,
        $or: [{ sku: regex }, { barcode: regex }],
      });

      baseFilter = {
        ...NOT_DELETED,
        $or: [
          ...PRODUCT_SEARCH_FIELDS.map((field) => ({
            [field]: regex,
          })),
          ...(variantProductIds.length
            ? [{ _id: { $in: variantProductIds } }]
            : []),
        ],
      };

      // Drop `search` so ApiFeatures.search doesn't apply a second (title-only)
      // $or that would AND with this one and hide SKU-only hits.
      delete params.search;
    }

    const features = new ApiFeatures<ProductDocument>(
      this.productModel
        .find(baseFilter)
        .populate(ProductRepository.populate),
      params,
      this.productModel,
    );

    return features
      .filter()
      .search(PRODUCT_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(id: Types.ObjectId | string): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({ _id: id, ...NOT_DELETED })
      .populate(ProductRepository.populate)
      .exec();
  }

  async findBySlug(slug: string): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({ slug, ...NOT_DELETED })
      .populate(ProductRepository.populate)
      .exec();
  }

  /** Active, non-deleted products for the public sitemap. */
  async listSitemapEntries(): Promise<
    Array<{ slug: string; updatedAt: Date }>
  > {
    const rows = await this.productModel
      .find({ ...NOT_DELETED, status: ProductStatus.ACTIVE })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows as unknown as Array<{ slug: string; updatedAt: Date }>;
  }

  /**
   * $match stages that can only run AFTER variants are joined and totals
   * computed. Kept as a helper so the main pipeline stays readable.
   *
   * - warehouseId scope → drop products with no levels in that warehouse
   *   (totalOnHand + totalReserved both 0 means "never stocked there")
   * - stockState → filter on the rolled-up numbers:
   *     inStock      → at least one variant with available > 0
   *     outOfStock   → variant on-hand quantity === 0 (live levels, not status)
   *     hasReserved  → variant reserved > 0
   *     lowStock     → a warehouse row with available <= threshold (default 5),
   *                    same rule as GET /analytics/lowStock (includes 0)
   */
  private static buildPostJoinStockFilters(opts: {
    scopedToWarehouse: boolean;
    minAvailable?: number;
    maxAvailable?: number;
    minOnHand?: number;
    maxOnHand?: number;
    minReserved?: number;
    maxReserved?: number;
  }): Record<string, unknown>[] {
    const stages: Record<string, unknown>[] = [];

    if (opts.scopedToWarehouse) {
      stages.push({
        $match: {
          $or: [{ totalOnHand: { $gt: 0 } }, { totalReserved: { $gt: 0 } }],
        },
      });
    }

    const available: Record<string, number> = {};
    if (opts.minAvailable !== undefined) available.$gte = opts.minAvailable;
    if (opts.maxAvailable !== undefined) available.$lte = opts.maxAvailable;
    if (Object.keys(available).length) {
      stages.push({ $match: { totalAvailable: available } });
    }

    const onHand: Record<string, number> = {};
    if (opts.minOnHand !== undefined) onHand.$gte = opts.minOnHand;
    if (opts.maxOnHand !== undefined) onHand.$lte = opts.maxOnHand;
    if (Object.keys(onHand).length) {
      stages.push({ $match: { totalOnHand: onHand } });
    }

    const reserved: Record<string, number> = {};
    if (opts.minReserved !== undefined) reserved.$gte = opts.minReserved;
    if (opts.maxReserved !== undefined) reserved.$lte = opts.maxReserved;
    if (Object.keys(reserved).length) {
      stages.push({ $match: { totalReserved: reserved } });
    }

    return stages;
  }

  /**
   * Admin stock overview: every (non-deleted) product → its variants → each
   * variant's stock, computed live from `inventory_levels` (on-hand, reserved,
   * available, per-warehouse breakdown), all in ONE database round-trip.
   *
   * Why aggregation instead of populate?
   * - populate() runs extra queries per ref and can only *embed* documents.
   * - An aggregation PIPELINE transforms data on the server: each stage
   *   receives the documents the previous stage produced ("docs in → docs
   *   out", like a conveyor belt) and can join, reshape, and compute numbers.
   *
   * NOTE: aggregate() returns plain JS objects, NOT Mongoose documents —
   * the global LocalizationInterceptor can't localize them (no
   * `toJSONLocalizedOnly` method on plain objects), so we resolve the
   * localized `title` INSIDE the pipeline using the request's language.
   */
  /**
   * Supported query filters for `GET /products/stockOverview`:
   *
   * | Param                         | Where it runs                    | Example |
   * |-------------------------------|----------------------------------|---------|
   * | status                        | product $match                   | `active` / `inactive` / `outOfStock` / `all` |
   * | category / brand              | product $match                   | ObjectId |
   * | slug                          | product $match                   | `iphone-15-pro` |
   * | showOnBanner                  | product $match                   | `true` / `false` |
   * | createdAt[gte] / createdAt[lte] | product $match                 | ISO date |
   * | search                        | title/slug/description OR sku/barcode | `shirt` |
   * | variantStatus                 | variants $lookup $match          | `active` |
   * | sku / barcode                 | variants $lookup $match          | contains, case-insensitive |
   * | unit                          | variants $lookup $match          | `piece` / `kg` / … |
   * | isDefault                     | variants $lookup $match          | `true` / `false` |
   * | minPrice / maxPrice           | variant effective price          | 20 / 80 |
   * | warehouseId                   | levels $lookup $match            | ObjectId |
   * | stockState                    | live stock                       | `inStock` / `outOfStock` / `hasReserved` / `lowStock` |
   * | inStock                       | alias for stockState             | `true` / `false` |
   * | lowStock                      | warehouse available <= N         | `true` / `5` (same as analytics/lowStock) |
   * | threshold                     | low-stock cap (implies lowStock) | default 5 |
   * | status=outOfStock             | live on-hand === 0, not status   | |
   * | minAvailable / maxAvailable   | after totals                     | live sellable units |
   * | minOnHand / maxOnHand         | after totals                     | |
   * | minReserved / maxReserved     | after totals                     | |
   * | sort                          | after totals                     | `order` (default), `newest`, `availableAsc`, `availableDesc`, `onHandAsc`, `onHandDesc`, `reservedDesc`, `priceAsc`, `priceDesc` |
   * | page, limit                   | $facet pagination                | |
   */
  async getStockOverview(queryParams: Record<string, unknown>): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: ProductStockOverview[];
  }> {
    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(queryParams.limit) || 20));

    // e.g. 'de' → we project '$title.de'; falls back to the default locale
    // when the requested translation is missing on a document.
    const locale = resolveRequestContentLocale();

    // ── Parse / sanitize filters ──
    // Only keep values that are safe to put into $match (typed ObjectIds,
    // known enums). Unknown junk is ignored so a typo can't break the query.
    const category = parseObjectId(queryParams.category);
    const brand = parseObjectId(queryParams.brand);
    const warehouseId = parseObjectId(queryParams.warehouseId);
    const unit = parseProductUnit(queryParams.unit);
    const isDefault = parseBooleanQuery(queryParams.isDefault);
    const showOnBanner = parseBooleanQuery(queryParams.showOnBanner);
    const createdAt = parseDateRange(queryParams.createdAt);
    const slug =
      typeof queryParams.slug === 'string' && queryParams.slug.trim()
        ? queryParams.slug.trim().toLowerCase()
        : undefined;
    const sku =
      typeof queryParams.sku === 'string' && queryParams.sku.trim()
        ? queryParams.sku.trim()
        : undefined;
    const barcode =
      typeof queryParams.barcode === 'string' && queryParams.barcode.trim()
        ? queryParams.barcode.trim()
        : undefined;
    let minPrice = parseNonNegativeNumber(queryParams.minPrice);
    let maxPrice = parseNonNegativeNumber(queryParams.maxPrice);
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }
    const minAvailable = parseNonNegativeNumber(queryParams.minAvailable);
    const maxAvailable = parseNonNegativeNumber(queryParams.maxAvailable);
    const minOnHand = parseNonNegativeNumber(queryParams.minOnHand);
    const maxOnHand = parseNonNegativeNumber(queryParams.maxOnHand);
    const minReserved = parseNonNegativeNumber(queryParams.minReserved);
    const maxReserved = parseNonNegativeNumber(queryParams.maxReserved);

    const STOCK_STATES = new Set([
      'inStock',
      'outOfStock',
      'hasReserved',
      'lowStock',
    ]);
    let stockState =
      typeof queryParams.stockState === 'string' &&
      STOCK_STATES.has(queryParams.stockState)
        ? queryParams.stockState
        : undefined;

    // `status=outOfStock` is the catalog enum — live stock can disagree.
    // Treat it as a quantity check instead of matching product.status.
    let status = parseProductStatus(queryParams.status);
    if (status === ProductStatus.OUT_OF_STOCK) {
      if (!stockState) stockState = 'outOfStock';
      status = undefined;
    }
    let variantStatus = parseProductStatus(queryParams.variantStatus);
    if (variantStatus === ProductStatus.OUT_OF_STOCK) {
      if (!stockState) stockState = 'outOfStock';
      variantStatus = undefined;
    }

    const lowStockFlag = parseBooleanQuery(queryParams.lowStock);
    const lowStockNumber =
      lowStockFlag === undefined
        ? parseNonNegativeNumber(queryParams.lowStock)
        : undefined;
    const thresholdParam = parseNonNegativeNumber(queryParams.threshold);
    let threshold = thresholdParam ?? lowStockNumber;

    if (!stockState) {
      const inStock = parseBooleanQuery(queryParams.inStock);
      if (inStock === true) stockState = 'inStock';
      else if (inStock === false) stockState = 'outOfStock';
      else if (
        lowStockFlag === true ||
        lowStockNumber !== undefined ||
        thresholdParam !== undefined
      ) {
        stockState = 'lowStock';
      }
    }
    if (stockState === 'lowStock' && threshold === undefined) {
      threshold = 5;
    }
    const search =
      typeof queryParams.search === 'string' && queryParams.search.trim()
        ? queryParams.search.trim()
        : undefined;

    const searchRegex = search
      ? new RegExp(escapeRegex(search), 'i')
      : undefined;

    const sortParam =
      typeof queryParams.sort === 'string' ? queryParams.sort : 'order';
    const sortStage: Record<string, 1 | -1> =
      sortParam === 'newest'
        ? { createdAt: -1 }
        : sortParam === 'availableAsc'
          ? { totalAvailable: 1, order: 1 }
          : sortParam === 'availableDesc'
            ? { totalAvailable: -1, order: 1 }
            : sortParam === 'onHandAsc'
              ? { totalOnHand: 1, order: 1 }
              : sortParam === 'onHandDesc'
                ? { totalOnHand: -1, order: 1 }
                : sortParam === 'reservedDesc'
                  ? { totalReserved: -1, order: 1 }
                  : sortParam === 'priceAsc'
                    ? { minEffectivePrice: 1, order: 1 }
                    : sortParam === 'priceDesc'
                      ? { minEffectivePrice: -1, order: 1 }
                      : { order: 1, createdAt: -1 };

    const priceMatch: Record<string, unknown> = {};
    if (minPrice !== undefined) priceMatch.$gte = minPrice;
    if (maxPrice !== undefined) priceMatch.$lte = maxPrice;

    const variantStockMatch: Record<string, unknown> | undefined =
      stockState === 'inStock'
        ? { available: { $gt: 0 } }
        : stockState === 'outOfStock'
          ? { onHand: 0 }
          : stockState === 'hasReserved'
            ? { reserved: { $gt: 0 } }
            : undefined;
    const isLowStock = stockState === 'lowStock';
    const lowStockThreshold = threshold ?? 5;

    const variantFiltersApplied = Boolean(
      variantStatus ||
        unit ||
        isDefault !== undefined ||
        sku ||
        barcode ||
        Object.keys(priceMatch).length ||
        variantStockMatch ||
        isLowStock,
    );

    const productMatch: Record<string, unknown> = { deletedAt: null };
    if (status) productMatch.status = status;
    if (category) productMatch.category = category;
    if (brand) productMatch.brand = brand;
    if (showOnBanner !== undefined) productMatch.showOnBanner = showOnBanner;
    if (slug) productMatch.slug = slug;
    if (createdAt) productMatch.createdAt = createdAt;

    const variantMatch: Record<string, unknown> = {
      $expr: { $eq: ['$product', '$$productId'] },
      deletedAt: null,
    };
    if (variantStatus) variantMatch.status = variantStatus;
    if (unit) variantMatch.unit = unit;
    if (isDefault !== undefined) variantMatch.isDefault = isDefault;
    if (sku) variantMatch.sku = new RegExp(escapeRegex(sku), 'i');
    if (barcode) variantMatch.barcode = new RegExp(escapeRegex(barcode), 'i');

    // Levels $match — optionally scoped to one warehouse.
    const levelMatch: Record<string, unknown> = {
      $expr: { $eq: ['$variant', '$$variantId'] },
    };
    if (warehouseId) levelMatch.warehouse = warehouseId;

    // Typed loosely: nested $lookup pipelines reject some PipelineStage
    // members (e.g. $merge) at the type level, even though we never use them.
    const pipeline: Record<string, unknown>[] = [
      // ── Stage 1: $match ── the WHERE clause of the pipeline.
      // Filters the ROOT collection (products) as early as possible so every
      // later stage works on fewer documents (this also lets Mongo use the
      // { deletedAt: 1, order: 1, createdAt: -1 } index).
      { $match: productMatch },

      // ── Stage 1b–1c (optional search): title/slug OR sku/barcode ──
      // 1b probes whether ANY variant of this product has a matching sku
      //    or barcode ($limit: 1 — we only care about existence).
      // 1c keeps the product if title/slug matches OR the probe found a hit.
      // Without this split, a title-only early $match would hide products
      // that only match by SKU.
      ...(searchRegex
        ? ([
            {
              $lookup: {
                from: 'product_variants',
                let: { productId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$product', '$$productId'] },
                      deletedAt: null,
                      $or: [{ sku: searchRegex }, { barcode: searchRegex }],
                    },
                  },
                  { $limit: 1 },
                  { $project: { _id: 1 } },
                ],
                as: '_skuHit',
              },
            },
            {
              $match: {
                // localizedSearchPaths('title') → ['title.en', 'title.de', …]
                // — stays in sync with SUPPORTED_CONTENT_LOCALES; never hardcode.
                $or: [
                  ...localizedSearchPaths('title').map((path) => ({
                    [path]: searchRegex,
                  })),
                  ...localizedSearchPaths('description').map((path) => ({
                    [path]: searchRegex,
                  })),
                  ...localizedSearchPaths('shortDescription').map((path) => ({
                    [path]: searchRegex,
                  })),
                  { slug: searchRegex },
                  { _skuHit: { $ne: [] } },
                ],
              },
            },
          ] as Record<string, unknown>[])
        : []),

      // ── Stage 3: $lookup (variants) ── a LEFT OUTER JOIN.
      // For each product, run a SUB-PIPELINE against `product_variants` and
      // attach the result as an ARRAY field called `variants`.
      //
      // `let` declares variables from the OUTER doc (the product) that the
      // inner pipeline can read as `$$productId` (double `$` = variable,
      // single `$` = field of the CURRENT document being processed).
      {
        $lookup: {
          from: 'product_variants', // the collection to join (raw Mongo name)
          let: { productId: '$_id' },
          pipeline: [
            // $expr lets us use the outer variable inside a $match:
            // "variant.product === product._id" — plus normal filters.
            { $match: variantMatch },
            { $sort: { order: 1 } },

            // ── Stage 3a: NESTED $lookup (levels) ── joins run per variant:
            // fetch this variant's rows from `inventory_levels` (one row per
            // warehouse that ever held stock for it).
            // When `warehouseId` is set, only that warehouse's level is kept,
            // so onHand/reserved/available become "at this warehouse" numbers.
            {
              $lookup: {
                from: 'inventory_levels',
                let: { variantId: '$_id' },
                pipeline: [
                  { $match: levelMatch },

                  // ── Stage 3a-i: third-level $lookup (warehouse) ── the
                  // classic localField/foreignField form (no sub-pipeline
                  // needed for a simple "match ids" join): embed the
                  // warehouse doc so we can show its name/code.
                  {
                    $lookup: {
                      from: 'warehouses',
                      localField: 'warehouse', // field on the level row
                      foreignField: '_id', // field on warehouses
                      as: 'warehouseDoc', // always an ARRAY (0 or 1 items here)
                    },
                  },

                  // ── $unwind ── deconstructs an array field into one doc
                  // per element. Our join matched at most 1 warehouse, so
                  // this just turns [wh] → wh. preserveNullAndEmptyArrays
                  // keeps the level row even if the warehouse was deleted.
                  {
                    $unwind: {
                      path: '$warehouseDoc',
                      preserveNullAndEmptyArrays: true,
                    },
                  },

                  // ── $project ── reshapes each level row into exactly the
                  // fields the FE needs (1 = keep, 0 = drop, '$x' = rename,
                  // {...} = computed expression).
                  {
                    $project: {
                      _id: 0,
                      warehouseId: '$warehouse',
                      warehouseName: '$warehouseDoc.name',
                      warehouseCode: '$warehouseDoc.code',
                      onHand: '$quantity',
                      // $ifNull: use 0 when reservedQuantity is missing.
                      reserved: { $ifNull: ['$reservedQuantity', 0] },
                      // available = max(0, quantity - reserved) — $max
                      // clamps so a data glitch can never show negative.
                      available: {
                        $max: [
                          0,
                          {
                            $subtract: [
                              '$quantity',
                              { $ifNull: ['$reservedQuantity', 0] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'byWarehouse',
              },
            },

            // Low stock matches analytics/lowStock: each warehouse row with
            // available <= threshold (including 0). Summing warehouses first
            // hid SKUs that were low in one location and healthy in another.
            ...(isLowStock
              ? [
                  {
                    $addFields: {
                      byWarehouse: {
                        $filter: {
                          input: '$byWarehouse',
                          as: 'wh',
                          cond: {
                            $lte: ['$$wh.available', lowStockThreshold],
                          },
                        },
                      },
                    },
                  },
                  { $match: { byWarehouse: { $ne: [] } } },
                ]
              : []),

            // ── Stage 3b: $addFields ── ADDS computed fields, keeps the
            // rest of the doc ($project would instead drop everything not
            // listed). '$byWarehouse.onHand' is array navigation: it means
            // "the onHand value of EVERY element" → an array of numbers,
            // which $sum then totals.
            {
              $addFields: {
                onHand: { $sum: '$byWarehouse.onHand' },
                reserved: { $sum: '$byWarehouse.reserved' },
                effectivePrice: {
                  $cond: [
                    { $gt: [{ $ifNull: ['$priceAfterDiscount', 0] }, 0] },
                    '$priceAfterDiscount',
                    '$price',
                  ],
                },
              },
            },
            {
              $addFields: {
                available: {
                  $max: [0, { $subtract: ['$onHand', '$reserved'] }],
                },
              },
            },
            ...(Object.keys(priceMatch).length
              ? [{ $match: { effectivePrice: priceMatch } }]
              : []),
            ...(variantStockMatch ? [{ $match: variantStockMatch }] : []),

            // When scoped to one warehouse, drop variants that have no level
            // row there at all (keeps the response focused on that location).
            ...(warehouseId
              ? [{ $match: { byWarehouse: { $ne: [] } } }]
              : []),

            // Final shape of each variant inside the product.
            {
              $project: {
                sku: 1,
                barcode: 1,
                price: 1,
                priceAfterDiscount: 1,
                status: 1,
                isDefault: 1,
                options: 1,
                unit: 1,
                order: 1,
                images: 1,
                stock: 1, // cached counter — should always equal onHand
                onHand: 1,
                reserved: 1,
                available: 1,
                byWarehouse: 1,
                effectivePrice: 1,
              },

            },
          ],
          as: 'variants',
        },
      },

      ...(variantFiltersApplied
        ? [{ $match: { variants: { $ne: [] } } }]
        : []),

      // analytics/lowStock is one row per warehouse level, not per product.
      // Unwind so iPhone (2 in Hamburg + 5 in Berlin) is 2 rows, not "Available 7".
      ...(isLowStock
        ? [
            { $unwind: '$variants' },
            { $unwind: '$variants.byWarehouse' },
            {
              $addFields: {
                variants: [
                  {
                    $mergeObjects: [
                      '$variants',
                      {
                        onHand: '$variants.byWarehouse.onHand',
                        reserved: '$variants.byWarehouse.reserved',
                        available: '$variants.byWarehouse.available',
                        byWarehouse: ['$variants.byWarehouse'],
                      },
                    ],
                  },
                ],
              },
            },
          ]
        : []),

      {
        $addFields: {
          variantsCount: { $size: '$variants' },
          totalOnHand: { $sum: '$variants.onHand' },
          totalReserved: { $sum: '$variants.reserved' },
          totalAvailable: { $sum: '$variants.available' },
          minEffectivePrice: { $min: '$variants.effectivePrice' },
        },
      },

      ...ProductRepository.buildPostJoinStockFilters({
        scopedToWarehouse: !!warehouseId,
        minAvailable,
        maxAvailable,
        minOnHand,
        maxOnHand,
        minReserved,
        maxReserved,
      }),

      { $sort: sortStage },

      // ── Stage 5: $project (final product shape) ──
      // `title` is stored as { en: '...', de: '...' } (i18n field), so we
      // pick the request's language with a dynamic path ('$title.de') and
      // fall back to the default content locale if that translation is
      // missing. This replaces what LocalizationInterceptor would normally
      // do for Mongoose documents.
      // Inclusion projection ($project with `1`s) automatically drops every
      // other field — including the internal `_skuHit` probe from Stage 1b.
      {
        $project: {
          title: {
            $ifNull: [`$title.${locale}`, `$title.${DEFAULT_CONTENT_LOCALE}`],
          },
          slug: 1,
          status: 1,
          variantsCount: 1,
          totalOnHand: 1,
          totalReserved: 1,
          totalAvailable: 1,
          variants: 1,
        },
      },

      // ── Stage 6: $facet ── runs MULTIPLE sub-pipelines over the SAME
      // input docs and returns one doc with one array per branch:
      //   data       → the requested page ($skip N docs, then take $limit)
      //   totalCount → $count collapses everything into [{ count: N }]
      // This gives the page AND the total in a single DB round-trip instead
      // of a separate countDocuments() query.
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.productModel
      .aggregate<{
        data: ProductStockOverview[];
        totalCount: Array<{ count: number }>;
      }>(pipeline as unknown as PipelineStage[])
      .exec();

    // totalCount is [] when no product matched, [{ count: N }] otherwise.
    const total = result.totalCount[0]?.count ?? 0;

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: result.data,
    };
  }

  /**
   * Customer catalog: active products + active variants, live `available`
   * (on-hand minus pending reservations). Warehouse rows and reserved
   * totals stay off the payload.
   *
   * Query params:
   * | category / brand     | ObjectId                         |
   * | search               | title, slug, sku, barcode        |
   * | showOnBanner         | true / false                     |
   * | minPrice / maxPrice  | effective variant price          |
   * | inStock              | true → totalAvailable > 0        |
   * | sort                 | order (default), priceAsc,       |
   * |                      | priceDesc, rating, newest        |
   * | page, limit          | pagination                       |
   */
  async getStorefrontCatalog(
    queryParams: Record<string, unknown>,
  ): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: StorefrontProduct[];
  }> {
    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(queryParams.limit) || 20));
    const locale = resolveRequestContentLocale();

    const category = parseObjectId(queryParams.category);
    const brand = parseObjectId(queryParams.brand);
    const showOnBanner = parseBooleanQuery(queryParams.showOnBanner);
    const inStock = parseBooleanQuery(queryParams.inStock);
    let minPrice = parseNonNegativeNumber(queryParams.minPrice);
    let maxPrice = parseNonNegativeNumber(queryParams.maxPrice);
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }
    const search =
      typeof queryParams.search === 'string' && queryParams.search.trim()
        ? queryParams.search.trim()
        : undefined;
    const searchRegex = search
      ? new RegExp(escapeRegex(search), 'i')
      : undefined;
    const slug =
      typeof queryParams.slug === 'string' && queryParams.slug.trim()
        ? queryParams.slug.trim().toLowerCase()
        : undefined;

    const productMatch: Record<string, unknown> = {
      deletedAt: null,
      status: ProductStatus.ACTIVE,
    };
    if (category) productMatch.category = category;
    if (brand) productMatch.brand = brand;
    if (showOnBanner !== undefined) productMatch.showOnBanner = showOnBanner;
    if (slug) productMatch.slug = slug;

    const priceMatch: Record<string, unknown> = {};
    if (minPrice !== undefined) priceMatch.$gte = minPrice;
    if (maxPrice !== undefined) priceMatch.$lte = maxPrice;

    const sortParam =
      typeof queryParams.sort === 'string' ? queryParams.sort : 'order';
    const sortStage: Record<string, 1 | -1> =
      sortParam === 'priceAsc'
        ? { minEffectivePrice: 1, order: 1 }
        : sortParam === 'priceDesc'
          ? { minEffectivePrice: -1, order: 1 }
          : sortParam === 'rating'
            ? { ratingsAverage: -1, ratingsQuantity: -1 }
            : sortParam === 'newest'
              ? { createdAt: -1 }
              : { order: 1, createdAt: -1 };

    const localizedTitle = {
      $ifNull: [`$title.${locale}`, `$title.${DEFAULT_CONTENT_LOCALE}`],
    };

    const pipeline: Record<string, unknown>[] = [
      { $match: productMatch },
      ...(searchRegex
        ? ([
            {
              $lookup: {
                from: 'product_variants',
                let: { productId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$product', '$$productId'] },
                      deletedAt: null,
                      status: ProductStatus.ACTIVE,
                      $or: [{ sku: searchRegex }, { barcode: searchRegex }],
                    },
                  },
                  { $limit: 1 },
                  { $project: { _id: 1 } },
                ],
                as: '_skuHit',
              },
            },
            {
              $match: {
                $or: [
                  ...localizedSearchPaths('title').map((path) => ({
                    [path]: searchRegex,
                  })),
                  { slug: searchRegex },
                  { _skuHit: { $ne: [] } },
                ],
              },
            },
          ] as Record<string, unknown>[])
        : []),
      {
        $lookup: {
          from: 'product_variants',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$product', '$$productId'] },
                deletedAt: null,
                status: ProductStatus.ACTIVE,
              },
            },
            { $sort: { order: 1 } },
            {
              $lookup: {
                from: 'inventory_levels',
                let: { variantId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$variant', '$$variantId'] } } },
                  {
                    $project: {
                      _id: 0,
                      available: {
                        $max: [
                          0,
                          {
                            $subtract: [
                              '$quantity',
                              { $ifNull: ['$reservedQuantity', 0] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: '_levels',
              },
            },
            {
              $addFields: {
                available: { $sum: '$_levels.available' },
                effectivePrice: {
                  $cond: [
                    { $gt: [{ $ifNull: ['$priceAfterDiscount', 0] }, 0] },
                    '$priceAfterDiscount',
                    '$price',
                  ],
                },
              },
            },
            ...(Object.keys(priceMatch).length
              ? [{ $match: { effectivePrice: priceMatch } }]
              : []),
            {
              $project: {
                sku: 1,
                price: 1,
                priceAfterDiscount: 1,
                status: 1,
                isDefault: 1,
                options: 1,
                unit: 1,
                order: 1,
                images: { $ifNull: ['$images', []] },
                available: 1,
                effectivePrice: 1,
              },
            },
          ],
          as: 'variants',
        },
      },
      { $match: { variants: { $ne: [] } } },
      {
        $addFields: {
          totalAvailable: { $sum: '$variants.available' },
          minEffectivePrice: { $min: '$variants.effectivePrice' },
        },
      },
      ...(inStock === true
        ? [{ $match: { totalAvailable: { $gt: 0 } } }]
        : []),
      { $sort: sortStage },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: '_category',
        },
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brand',
          foreignField: '_id',
          as: '_brand',
        },
      },
      {
        $unwind: { path: '$_category', preserveNullAndEmptyArrays: true },
      },
      {
        $unwind: { path: '$_brand', preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          title: localizedTitle,
          slug: 1,
          images: { $ifNull: ['$images', []] },
          showOnBanner: 1,
          ratingsAverage: 1,
          ratingsQuantity: 1,
          totalAvailable: 1,
          variants: {
            $map: {
              input: '$variants',
              as: 'v',
              in: {
                _id: '$$v._id',
                sku: '$$v.sku',
                price: '$$v.price',
                priceAfterDiscount: '$$v.priceAfterDiscount',
                status: '$$v.status',
                isDefault: '$$v.isDefault',
                options: '$$v.options',
                unit: '$$v.unit',
                order: '$$v.order',
                images: '$$v.images',
                available: '$$v.available',
              },
            },
          },
          category: {
            $cond: [
              { $ifNull: ['$_category._id', false] },
              {
                _id: '$_category._id',
                title: {
                  $ifNull: [
                    `$_category.title.${locale}`,
                    `$_category.title.${DEFAULT_CONTENT_LOCALE}`,
                  ],
                },
                slug: '$_category.slug',
                image: '$_category.image',
              },
              null,
            ],
          },
          brand: {
            $cond: [
              { $ifNull: ['$_brand._id', false] },
              {
                _id: '$_brand._id',
                title: {
                  $ifNull: [
                    `$_brand.title.${locale}`,
                    `$_brand.title.${DEFAULT_CONTENT_LOCALE}`,
                  ],
                },
                slug: '$_brand.slug',
                logo: '$_brand.logo',
              },
              null,
            ],
          },
        },
      },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.productModel
      .aggregate<{
        data: StorefrontProduct[];
        totalCount: Array<{ count: number }>;
      }>(pipeline as unknown as PipelineStage[])
      .exec();

    const total = result.totalCount[0]?.count ?? 0;
    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
      data: result.data,
    };
  }

  async getStorefrontBySlug(
    slug: string,
  ): Promise<StorefrontProduct | null> {
    const { data } = await this.getStorefrontCatalog({
      slug,
      page: 1,
      limit: 1,
    });
    return data[0] ?? null;
  }

  async findByDefaultLocaleTitle(
    title: string,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({
        [localizedPath('title', DEFAULT_CONTENT_LOCALE)]: title,
        ...NOT_DELETED,
      })
      .exec();
  }

  async getMaxOrder(): Promise<number> {
    const product = await this.productModel
      .findOne({ ...NOT_DELETED })
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();

    return product?.order ?? 0;
  }

  async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    return buildUniqueSlug({
      title,
      model: this.productModel,
      excludeId,
      extraFilter: NOT_DELETED,
    });
  }

  async createProduct(
    data: CreateProductPersistence,
    session?: ClientSession,
  ): Promise<ProductDocument> {
    const [product] = await this.productModel.create([data], { session });
    return product;
  }

  async createProducts(
    products: CreateProductPersistence[],
  ): Promise<ProductDocument[]> {
    const session = await this.connection.startSession();
    try {
      let created: ProductDocument[] = [];
      await session.withTransaction(async () => {
        created = await this.productModel.insertMany(products, { session });
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  async updateProduct(
    id: Types.ObjectId | string,
    dto: UpdateProductDto,
    session?: ClientSession,
  ): Promise<ProductDocument | null> {
    const $set = flattenObject(dto as Record<string, unknown>);
    return this.productModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set },
        { new: true, runValidators: true, session },
      )
      .populate(ProductRepository.populate)
      .exec();
  }

  async reorderProducts(
    items: ReorderProductItemDto[],
  ): Promise<ProductDocument[]> {
    const session = await this.connection.startSession();
    try {
      let updated: ProductDocument[] = [];
      await session.withTransaction(async () => {
        const ops = items.map((item) => ({
          updateOne: {
            filter: { _id: item.productId, ...NOT_DELETED },
            update: { $set: { order: item.order } },
          },
        }));
        await this.productModel.bulkWrite(ops, { session });

        const ids = items.map((item) => item.productId);
        updated = await this.productModel
          .find({ _id: { $in: ids }, ...NOT_DELETED })
          .session(session)
          .populate(ProductRepository.populate)
          .exec();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  async softDeleteProduct(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.productModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set: { deletedAt: new Date() } },
        { session },
      )
      .exec();
  }
}
