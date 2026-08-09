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
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { generateUniqueSlug as buildUniqueSlug } from '../../../common/utils/slug.util';
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
import { Product, ProductDocument } from '../schemas/product.schema';

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

@Injectable()
export class ProductRepository {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private static readonly populate = [
    { path: 'category', select: CATEGORY_PUBLIC_FIELDS },
    { path: 'brand', select: BRAND_PUBLIC_FIELDS },
  ];

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const params = {
      ...queryParams,
      sort: queryParams.sort ?? PRODUCT_DEFAULT_SORT,
    };

    const features = new ApiFeatures<ProductDocument>(
      this.productModel
        .find({ ...NOT_DELETED })
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

  /**
   * $match stages that can only run AFTER variants are joined and totals
   * computed. Kept as a helper so the main pipeline stays readable.
   *
   * - warehouseId scope → drop products with no levels in that warehouse
   *   (totalOnHand + totalReserved both 0 means "never stocked there")
   * - stockState → filter on the rolled-up numbers:
   *     inStock      → totalAvailable > 0
   *     outOfStock   → totalAvailable === 0
   *     hasReserved  → totalReserved > 0  (useful to find held checkout stock)
   */
  private static buildPostJoinStockFilters(opts: {
    scopedToWarehouse: boolean;
    stockState?: string;
  }): Record<string, unknown>[] {
    const stages: Record<string, unknown>[] = [];

    if (opts.scopedToWarehouse) {
      stages.push({
        $match: {
          $or: [{ totalOnHand: { $gt: 0 } }, { totalReserved: { $gt: 0 } }],
        },
      });
    }

    if (opts.stockState === 'inStock') {
      stages.push({ $match: { totalAvailable: { $gt: 0 } } });
    } else if (opts.stockState === 'outOfStock') {
      stages.push({ $match: { totalAvailable: 0 } });
    } else if (opts.stockState === 'hasReserved') {
      stages.push({ $match: { totalReserved: { $gt: 0 } } });
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
   * Supported query filters for `GET /products/stock-overview`:
   *
   * | Param            | Where it runs                         | Example                          |
   * |------------------|---------------------------------------|----------------------------------|
   * | status           | product early $match                  | `active` / `inactive` / `outOfStock` |
   * | category         | product early $match                  | ObjectId                         |
   * | brand            | product early $match                  | ObjectId                         |
   * | search           | product early $match (title/slug) +   | `shirt` / `SKU-001`              |
   * |                  | also matches products that have a     |                                  |
   * |                  | variant whose sku/barcode contains it |                                  |
   * | variantStatus    | inside variants $lookup $match        | `active`                         |
   * | warehouseId      | inside levels $lookup $match          | ObjectId — only that warehouse's |
   * |                  |                                       | levels; products with 0 there    |
   * |                  |                                       | are dropped after totals         |
   * | stockState       | AFTER totals are computed             | `inStock` / `outOfStock` /       |
   * |                  |                                       | `hasReserved`                    |
   * | page, limit      | $facet pagination                     | page=1&limit=20                  |
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
    const status =
      typeof queryParams.status === 'string' && queryParams.status !== 'all'
        ? queryParams.status
        : undefined;
    const category =
      typeof queryParams.category === 'string' &&
      Types.ObjectId.isValid(queryParams.category)
        ? new Types.ObjectId(queryParams.category)
        : undefined;
    const brand =
      typeof queryParams.brand === 'string' &&
      Types.ObjectId.isValid(queryParams.brand)
        ? new Types.ObjectId(queryParams.brand)
        : undefined;
    const warehouseId =
      typeof queryParams.warehouseId === 'string' &&
      Types.ObjectId.isValid(queryParams.warehouseId)
        ? new Types.ObjectId(queryParams.warehouseId)
        : undefined;
    const variantStatus =
      typeof queryParams.variantStatus === 'string'
        ? queryParams.variantStatus
        : undefined;
    const stockState =
      typeof queryParams.stockState === 'string'
        ? queryParams.stockState
        : undefined;
    const search =
      typeof queryParams.search === 'string' && queryParams.search.trim()
        ? queryParams.search.trim()
        : undefined;

    // Escape regex special chars so a search like "a+b" is treated literally.
    const searchRegex = search
      ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : undefined;

    // ── Early product $match object ── built dynamically so we only add
    // keys the client actually sent. Putting filters HERE (before $lookup)
    // is the cheapest place — fewer products = fewer joins.
    // NOTE: `search` is NOT applied here — it ORs title/slug with sku/barcode,
    // and sku lives on another collection, so that OR is applied in Stage 1c
    // after a tiny probe $lookup.
    const productMatch: Record<string, unknown> = { deletedAt: null };
    if (status) productMatch.status = status;
    if (category) productMatch.category = category;
    if (brand) productMatch.brand = brand;

    // Variant-level $match (inside the variants $lookup). Always join on
    // productId; optionally also filter by variant status.
    const variantMatch: Record<string, unknown> = {
      $expr: { $eq: ['$product', '$$productId'] },
      deletedAt: null,
    };
    if (variantStatus) variantMatch.status = variantStatus;

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
                  { slug: searchRegex },
                  // $ne: [] means "the probe array is not empty"
                  { _skuHit: { $ne: [] } },
                ],
              },
            },
          ] as Record<string, unknown>[])
        : []),

      // ── Stage 2: $sort ── stable ordering BEFORE pagination, otherwise
      // $skip/$limit would slice an arbitrary order and pages could repeat
      // or miss items between requests.
      { $sort: { order: 1, createdAt: -1 } },

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

            // ── Stage 3b: $addFields ── ADDS computed fields, keeps the
            // rest of the doc ($project would instead drop everything not
            // listed). '$byWarehouse.onHand' is array navigation: it means
            // "the onHand value of EVERY element" → an array of numbers,
            // which $sum then totals.
            {
              $addFields: {
                onHand: { $sum: '$byWarehouse.onHand' },
                reserved: { $sum: '$byWarehouse.reserved' },
              },
            },
            // Separate $addFields because a stage can't read a field it is
            // itself creating — 'onHand' only exists AFTER the stage above.
            {
              $addFields: {
                available: {
                  $max: [0, { $subtract: ['$onHand', '$reserved'] }],
                },
              },
            },

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
                stock: 1, // cached counter — should always equal onHand
                onHand: 1,
                reserved: 1,
                available: 1,
                byWarehouse: 1,
              },
            },
          ],
          as: 'variants',
        },
      },

      // ── Stage 4: $addFields (product totals) ── roll the variant numbers
      // up to the product level. Same "array navigation + $sum" trick.
      {
        $addFields: {
          variantsCount: { $size: '$variants' },
          totalOnHand: { $sum: '$variants.onHand' },
          totalReserved: { $sum: '$variants.reserved' },
          totalAvailable: { $sum: '$variants.available' },
        },
      },

      // ── Stage 4b: post-join filters ── these MUST run AFTER totals exist
      // (stockState / warehouse presence). Filtering earlier would be wrong
      // because onHand/reserved are computed fields, not stored columns.
      ...ProductRepository.buildPostJoinStockFilters({
        scopedToWarehouse: !!warehouseId,
        stockState,
      }),

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
