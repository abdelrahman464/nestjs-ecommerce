import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { isDuplicateKeyError } from '../../common/utils/mongo-error.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../products/schemas/product-variant.schema';
import { resolveProductStatus } from '../products/utils/product-status.util';
import { WarehousesService } from '../warehouses/warehouses.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import { AuditResourceType } from '../audit-log/enums/audit-resource-type.enum';
import { AuditSource } from '../audit-log/enums/audit-source.enum';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { CreateInventoryTransferDto } from './dto/create-inventory-transfer.dto';
import { InventoryDirection } from './enums/inventory-direction.enum';
import { InventoryMovementType } from './enums/inventory-movement-type.enum';
import { InventoryReferenceType } from './enums/inventory-reference-type.enum';
import { InventoryLevelsRepository } from './repository/inventory-levels.repository';
import {
  CreateMovementPersistence,
  InventoryRepository,
} from './repository/inventory.repository';
import { InventoryLevelDocument } from './schemas/inventory-level.schema';
import { InventoryMovementDocument } from './schemas/inventory-movement.schema';

type PostMovementParams = {
  variantId: Types.ObjectId | string;
  warehouseId: Types.ObjectId | string;
  type: InventoryMovementType;
  quantity: number;
  direction: InventoryDirection;
  referenceType: InventoryReferenceType;
  referenceId?: Types.ObjectId | string | null;
  reason?: string;
  createdBy?: Types.ObjectId | string | null;
  session?: ClientSession;
  /** Skip assertUsable when caller already validated (e.g. transfer). */
  skipWarehouseAssert?: boolean;
};

function toObjectId(
  value: Types.ObjectId | string | { _id: Types.ObjectId },
): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return new Types.ObjectId(String(value._id));
  }
  return new Types.ObjectId(String(value));
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly levelsRepository: InventoryLevelsRepository,
    private readonly warehousesService: WarehousesService,
    private readonly auditLogService: AuditLogService,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariantDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findOne(id: Types.ObjectId): Promise<InventoryMovementDocument> {
    const movement = await this.inventoryRepository.findById(id);
    if (!movement) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'inventory.movementNotFound',
        { id: id.toString() },
      );
    }
    return movement;
  }

  async findAllMovements(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    return this.inventoryRepository.findAll(queryParams);
  }

  async findByVariant(
    variantId: Types.ObjectId,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    await this.requireVariant(variantId);
    return this.inventoryRepository.findByVariant(variantId, queryParams);
  }

  async findByProduct(
    productId: Types.ObjectId,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    return this.inventoryRepository.findByProduct(productId, queryParams);
  }

  async findMovementsByWarehouse(
    warehouseId: Types.ObjectId,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryMovementDocument>> {
    await this.warehousesService.findOne(warehouseId);
    return this.inventoryRepository.findByWarehouse(warehouseId, queryParams);
  }

  async findLevelsByVariant(variantId: Types.ObjectId): Promise<{
    data: InventoryLevelDocument[];
    totalStock: number;
  }> {
    await this.requireVariant(variantId);
    const data = await this.levelsRepository.findByVariantForDisplay(variantId);
    const totalStock = data.reduce((sum, row) => sum + row.quantity, 0);
    return { data, totalStock };
  }

  /** Used by product/variant deletion guards — true if any variant still has on-hand stock. */
  async hasOnHandStock(
    variantIds: Array<Types.ObjectId | string>,
  ): Promise<boolean> {
    return this.levelsRepository.existsPositiveStockForVariants(variantIds);
  }

  async findLevelsByWarehouse(
    warehouseId: Types.ObjectId,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryLevelDocument>> {
    await this.warehousesService.findOne(warehouseId);
    return this.levelsRepository.findByWarehouse(warehouseId, queryParams);
  }

  /**
   * Admin UI — restock / return / adjustment / damage only.
   * Requires warehouseId (multi-location).
   */
  async postManualMovement(
    dto: CreateInventoryMovementDto,
    createdBy: string,
  ): Promise<InventoryMovementDocument> {
    const direction = this.resolveManualDirection(dto.type, dto.direction);

    const movement = await this.postMovement({
      variantId: dto.variantId,
      warehouseId: dto.warehouseId,
      type: dto.type,
      quantity: dto.quantity,
      direction,
      referenceType: InventoryReferenceType.MANUAL,
      reason: dto.reason,
      createdBy,
    });

    await this.auditLogService.record({
      action: AuditAction.INVENTORY_MANUAL_MOVEMENT,
      resourceType: AuditResourceType.INVENTORY,
      resourceId: movement._id,
      actorId: createdBy,
      source: AuditSource.HTTP,
      metadata: {
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        type: dto.type,
        quantity: dto.quantity,
        direction,
        reason: dto.reason,
      },
    });

    return movement;
  }

  /**
   * Move stock between warehouses in one TX.
   * Net variant.stock change is 0 (out then in with opposite deltas).
   */
  async transfer(
    dto: CreateInventoryTransferDto,
    createdBy: string,
  ): Promise<{ out: InventoryMovementDocument; in: InventoryMovementDocument }> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'inventory.transferSameWarehouse',
      );
    }

    await this.warehousesService.assertUsable(dto.fromWarehouseId);
    await this.warehousesService.assertUsable(dto.toWarehouseId);

    const session = await this.connection.startSession();
    try {
      let out!: InventoryMovementDocument;
      let inn!: InventoryMovementDocument;
      // Shared id links the out/in pair for audit / idempotency.
      const referenceId = new Types.ObjectId();
      await session.withTransaction(async () => {
        out = await this.postMovement({
          variantId: dto.variantId,
          warehouseId: dto.fromWarehouseId,
          type: InventoryMovementType.TRANSFER,
          quantity: dto.quantity,
          direction: InventoryDirection.OUT,
          referenceType: InventoryReferenceType.TRANSFER,
          referenceId,
          reason: dto.reason,
          createdBy,
          session,
          skipWarehouseAssert: true,
        });

        inn = await this.postMovement({
          variantId: dto.variantId,
          warehouseId: dto.toWarehouseId,
          type: InventoryMovementType.TRANSFER,
          quantity: dto.quantity,
          direction: InventoryDirection.IN,
          referenceType: InventoryReferenceType.TRANSFER,
          referenceId,
          reason: dto.reason,
          createdBy,
          session,
          skipWarehouseAssert: true,
        });
      });

      await this.auditLogService.record({
        action: AuditAction.INVENTORY_TRANSFER,
        resourceType: AuditResourceType.INVENTORY,
        resourceId: referenceId,
        actorId: createdBy,
        source: AuditSource.HTTP,
        metadata: {
          variantId: dto.variantId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          reason: dto.reason,
          outMovementId: out._id.toString(),
          inMovementId: inn._id.toString(),
        },
      });

      return { out, in: inn };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Opening stock on variant create → default warehouse level + initial movement.
   */
  async postInitialStock(params: {
    variantId: Types.ObjectId | string;
    quantity: number;
    createdBy?: Types.ObjectId | string | null;
    session?: ClientSession;
  }): Promise<InventoryMovementDocument | null> {
    if (params.quantity <= 0) return null;

    const defaultWarehouse = await this.warehousesService.getDefault();

    return this.postMovement({
      variantId: params.variantId,
      warehouseId: defaultWarehouse._id,
      type: InventoryMovementType.INITIAL,
      quantity: params.quantity,
      direction: InventoryDirection.IN,
      referenceType: InventoryReferenceType.VARIANT_CREATE,
      referenceId: params.variantId,
      createdBy: params.createdBy ?? null,
      session: params.session,
      skipWarehouseAssert: true,
    });
  }

  /**
   * MVP sales: decrement DEFAULT warehouse only (Phase 11 allocates across sites).
   * Idempotent on webhook retry.
   */
  async postSaleForPayment(params: {
    paymentId: Types.ObjectId | string;
    items: Array<{ variant: Types.ObjectId | string; quantity: number }>;
  }): Promise<InventoryMovementDocument[]> {
    const defaultWarehouse = await this.warehousesService.getDefault();
    const session = await this.connection.startSession();
    try {
      const results: InventoryMovementDocument[] = [];
      await session.withTransaction(async () => {
        for (const item of params.items) {
          const movement = await this.postMovement({
            variantId: item.variant,
            warehouseId: defaultWarehouse._id,
            type: InventoryMovementType.SALE,
            quantity: item.quantity,
            direction: InventoryDirection.OUT,
            referenceType: InventoryReferenceType.WEBHOOK,
            referenceId: params.paymentId,
            session,
            skipWarehouseAssert: true,
          });
          results.push(movement);
        }
      });
      return results;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Core inventory write path — the only place that may change stock.
   *
   * Applies **one** movement to **one** warehouse: updates the warehouse level,
   * updates the cached `variant.stock` total, and appends an immutable ledger row.
   * All of that runs in a single MongoDB transaction.
   *
   * -------------------------------------------------------------------------
   * Callers (do not bypass this method)
   * -------------------------------------------------------------------------
   * - `postManualMovement`     → admin restock / return / adjustment / damage
   * - `postInitialStock`       → opening balance on variant create (default WH)
   * - `postSaleForPayment`     → webhook sale (default WH, MVP)
   * - `transfer`               → calls this twice (OUT @ from, IN @ to)
   *
   * -------------------------------------------------------------------------
   * Steps (inside `run`, under an open session)
   * -------------------------------------------------------------------------
   * 1. Optionally assert warehouse is usable (active, not deleted).
   * 2. Idempotency: if `referenceId` is set, return an existing movement that
   *    matches (referenceType, referenceId, variant, type, warehouse).
   * 3. Load the live variant; compute signed `delta` from direction + quantity.
   * 4. Load (or treat as 0) `inventory_levels` for variant × warehouse;
   *    reject if level would go negative.
   * 5. Apply delta to the level (create row on first inbound if missing).
   * 6. Apply the same delta to `variant.stock` + resolve status
   *    (optimistic lock on previous stock value).
   * 7. Insert `inventory_movements` with level balanceBefore / balanceAfter.
   *
   * -------------------------------------------------------------------------
   * Session / transaction
   * -------------------------------------------------------------------------
   * - If `params.session` is provided → join the caller's TX (variant create,
   *   transfer outer TX, payment fulfill). Do **not** start a nested TX.
   * - If omitted → start `withTransaction` here for a standalone write.
   *
   * -------------------------------------------------------------------------
   * Params of note
   * -------------------------------------------------------------------------
   * @param params.variantId       Sellable unit whose stock changes.
   * @param params.warehouseId     Location where the level is updated.
   * @param params.type            Business reason (sale, restock, transfer, …).
   * @param params.quantity        Absolute units moved (always ≥ 1).
   * @param params.direction       `in` → +qty, `out` → −qty.
   * @param params.referenceType   How the write entered the system.
   * @param params.referenceId     Optional idempotency / link id (payment,
   *                               variant, shared transfer id). Omit for
   *                               plain manual admin movements.
   * @param params.reason          Optional human note.
   * @param params.createdBy       Admin/manager user id when a human acted.
   * @param params.session         Existing ClientSession to join, if any.
   * @param params.skipWarehouseAssert  When true, caller already validated
   *                               the warehouse (e.g. transfer).
   *
   * @returns The created movement, or the existing one on idempotent replay.
   *
   * @throws inventory.invalidQuantity      quantity < 1
   * @throws warehouse.* / product.variantNotFound
   * @throws inventory.insufficientStock    level or global stock would go below 0
   * @throws inventory.stockConflict        concurrent update lost optimistic lock
   */
  async postMovement(
    params: PostMovementParams,
  ): Promise<InventoryMovementDocument> {
    if (params.quantity < 1) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'inventory.invalidQuantity',
      );
    }

    const run = async (
      session: ClientSession,
    ): Promise<InventoryMovementDocument> => {
      if (!params.skipWarehouseAssert) {
        await this.warehousesService.assertUsable(params.warehouseId);
      }

      if (params.referenceId) {
        const existing = await this.inventoryRepository.findByIdempotencyKey({
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          variant: params.variantId,
          type: params.type,
          warehouse: params.warehouseId,
          session,
        });
        if (existing) return existing;
      }

      const variant = await this.variantModel
        .findOne({ _id: params.variantId, deletedAt: null })
        .session(session)
        .exec();

      if (!variant) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'product.variantNotFound',
          { id: String(params.variantId) },
        );
      }

      const delta =
        params.direction === InventoryDirection.IN
          ? params.quantity
          : -params.quantity;

      const level = await this.levelsRepository.findByVariantAndWarehouse(
        variant._id,
        params.warehouseId,
        session,
      );
      const balanceBefore = level?.quantity ?? 0;
      const balanceAfter = balanceBefore + delta;

      if (balanceAfter < 0) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'inventory.insufficientStock',
          {
            available: balanceBefore,
            requested: params.quantity,
          },
        );
      }

      // Level update (create on first inbound if missing)
      const updatedLevel = await this.levelsRepository.applyDelta({
        variantId: variant._id,
        productId: variant.product,
        warehouseId: params.warehouseId,
        delta,
        balanceBefore,
        session,
      });

      if (!updatedLevel) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'inventory.stockConflict',
        );
      }

      // Global cache: same delta so sum(levels) stays aligned with variant.stock
      const globalBefore = variant.stock;
      const globalAfter = globalBefore + delta;
      if (globalAfter < 0) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'inventory.insufficientStock',
          {
            available: globalBefore,
            requested: params.quantity,
          },
        );
      }

      const nextStatus = resolveProductStatus(globalAfter, variant.status);
      const updatedVariant = await this.variantModel
        .findOneAndUpdate(
          {
            _id: variant._id,
            deletedAt: null,
            stock: globalBefore,
          },
          {
            $set: {
              stock: globalAfter,
              status: nextStatus,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!updatedVariant) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'inventory.stockConflict',
        );
      }

      const warehouseOid = toObjectId(params.warehouseId);
      const payload: CreateMovementPersistence = {
        variant: variant._id,
        product: variant.product,
        warehouse: warehouseOid,
        type: params.type,
        quantity: params.quantity,
        direction: params.direction,
        delta,
        balanceBefore,
        balanceAfter,
        reason: params.reason,
        referenceType: params.referenceType,
        referenceId: params.referenceId
          ? toObjectId(params.referenceId)
          : null,
        createdBy: params.createdBy ? toObjectId(params.createdBy) : null,
      };

      try {
        return await this.inventoryRepository.create(payload, session);
      } catch (error) {
        if (isDuplicateKeyError(error) && params.referenceId) {
          const existing =
            await this.inventoryRepository.findByIdempotencyKey({
              referenceType: params.referenceType,
              referenceId: params.referenceId,
              variant: params.variantId,
              type: params.type,
              warehouse: params.warehouseId,
              session,
            });
          if (existing) return existing;
        }
        throw error;
      }
    };


    if (params.session) {
      return run(params.session);
    }
    
    const session = await this.connection.startSession();
    try {
      let result!: InventoryMovementDocument;
      await session.withTransaction(async () => {
        result = await run(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private resolveManualDirection(
    type: InventoryMovementType,
    direction?: InventoryDirection,
  ): InventoryDirection {
    switch (type) {
      case InventoryMovementType.RESTOCK:
      case InventoryMovementType.RETURN:
        return InventoryDirection.IN;
      case InventoryMovementType.DAMAGE:
        return InventoryDirection.OUT;
      case InventoryMovementType.ADJUSTMENT:
        if (!direction) {
          throw new I18nHttpException(
            HttpStatus.BAD_REQUEST,
            'inventory.directionRequired',
          );
        }
        return direction;
      default:
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'inventory.manualTypeNotAllowed',
          { type },
        );
    }
  }

  private async requireVariant(
    variantId: Types.ObjectId | string,
  ): Promise<ProductVariantDocument> {
    const variant = await this.variantModel
      .findOne({ _id: variantId, deletedAt: null })
      .exec();
    if (!variant) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.variantNotFound',
        { id: String(variantId) },
      );
    }
    return variant;
  }
}
