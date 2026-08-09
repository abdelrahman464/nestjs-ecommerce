import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { ContentLocale } from '../../../common/constants/supported-content-locales.constant';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { resolveLocalizedTitle } from '../../products/utils/product-populate.util';
import { INVENTORY_SEARCH_FIELDS } from '../constants/inventory.constants';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum';
import { InventoryReferenceType } from '../enums/inventory-reference-type.enum';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from '../schemas/inventory-movement.schema';

/**
 * Applied only to the read/list methods below (FE display) — never to
 * `create`/`findByIdempotencyKey`, which stay on raw ObjectIds since their
 * output feeds back into write-path logic (idempotent replay, postMovement).
 *
 * `product.title` is an i18n field — see `resolveLocalizedTitle` for why it
 * must be resolved manually via a populate `transform` here.
 */
const MOVEMENT_POPULATE = [
  { path: 'variant', select: 'sku barcode' },
  {
    path: 'product',
    select: 'title slug',
    transform: (
      doc: {
        _id: Types.ObjectId;
        title?: Partial<Record<ContentLocale, string>> | string;
        slug?: string;
      } | null,
    ) =>
      doc && {
        _id: doc._id,
        title: resolveLocalizedTitle(doc),
        slug: doc.slug ?? null,
      },
  },
  { path: 'warehouse', select: 'name code' },
];

export type CreateMovementPersistence = {
  variant: Types.ObjectId;
  product: Types.ObjectId;
  warehouse: Types.ObjectId;
  type: InventoryMovementType;
  quantity: number;
  direction: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string;
  referenceType: InventoryReferenceType;
  referenceId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
};

@Injectable()
export class InventoryRepository {
  constructor(
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
  ) {}

  async create(
    data: CreateMovementPersistence,
    session?: ClientSession,
  ): Promise<InventoryMovementDocument> {
    const [doc] = await this.movementModel.create([data], { session });
    return doc as InventoryMovementDocument;
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<InventoryMovementDocument | null> {
    return this.movementModel.findById(id).populate(MOVEMENT_POPULATE).exec();
  }

  async findByIdempotencyKey(params: {
    referenceType: InventoryReferenceType;
    referenceId: Types.ObjectId | string;
    variant: Types.ObjectId | string;
    type: InventoryMovementType;
    warehouse: Types.ObjectId | string;
    session?: ClientSession;
  }): Promise<InventoryMovementDocument | null> {
    return this.movementModel
      .findOne({
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        variant: params.variant,
        type: params.type,
        warehouse: params.warehouse,
      })
      .session(params.session ?? null)
      .exec();
  }

  /** Unscoped listing — every movement, newest first, with optional filters. */
  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    const { type, variantId, productId, warehouseId, ...rest } = queryParams;
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (variantId) filter.variant = variantId;
    if (productId) filter.product = productId;
    if (warehouseId) filter.warehouse = warehouseId;

    const features = new ApiFeatures<InventoryMovementDocument>(
      this.movementModel
        .find<InventoryMovementDocument>(filter)
        .populate(MOVEMENT_POPULATE),
      rest,
      this.movementModel,
    )
      .filter()
      .search(INVENTORY_SEARCH_FIELDS)
      .sort()
      .paginate();

    return features.executePaginated();
  }

  async findByVariant(
    variantId: Types.ObjectId | string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    const { type, warehouseId, ...rest } = queryParams;
    const filter: Record<string, unknown> = { variant: variantId };
    if (type) filter.type = type;
    if (warehouseId) filter.warehouse = warehouseId;

    const features = new ApiFeatures<InventoryMovementDocument>(
      this.movementModel
        .find<InventoryMovementDocument>(filter)
        .populate(MOVEMENT_POPULATE),
      rest,
      this.movementModel,
    )
      .filter()
      .search(INVENTORY_SEARCH_FIELDS)
      .sort()
      .paginate();

    return features.executePaginated();
  }

  async findByProduct(
    productId: Types.ObjectId | string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    const { type, warehouseId, ...rest } = queryParams;
    const filter: Record<string, unknown> = { product: productId };
    if (type) filter.type = type;
    if (warehouseId) filter.warehouse = warehouseId;

    const features = new ApiFeatures<InventoryMovementDocument>(
      this.movementModel
        .find<InventoryMovementDocument>(filter)
        .populate(MOVEMENT_POPULATE),
      rest,
      this.movementModel,
    )
      .filter()
      .search(INVENTORY_SEARCH_FIELDS)
      .sort()
      .paginate();

    return features.executePaginated();
  }

  async findByWarehouse(
    warehouseId: Types.ObjectId | string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    const { type, ...rest } = queryParams;
    const filter: Record<string, unknown> = { warehouse: warehouseId };
    if (type) filter.type = type;

    const features = new ApiFeatures<InventoryMovementDocument>(
      this.movementModel
        .find<InventoryMovementDocument>(filter)
        .populate(MOVEMENT_POPULATE),
      rest,
      this.movementModel,
    )
      .filter()
      .search(INVENTORY_SEARCH_FIELDS)
      .sort()
      .paginate();

    return features.executePaginated();
  }
}
