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
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { InventoryDirection } from './enums/inventory-direction.enum';
import { InventoryMovementType } from './enums/inventory-movement-type.enum';
import { InventoryReferenceType } from './enums/inventory-reference-type.enum';
import {
  CreateMovementPersistence,
  InventoryRepository,
} from './repository/inventory.repository';
import { InventoryMovementDocument } from './schemas/inventory-movement.schema';

type PostMovementParams = {
  variantId: Types.ObjectId | string;
  type: InventoryMovementType;
  quantity: number;
  direction: InventoryDirection;
  referenceType: InventoryReferenceType;
  referenceId?: Types.ObjectId | string | null;
  reason?: string;
  createdBy?: Types.ObjectId | string | null;
  session?: ClientSession;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
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
    //*TODO: check if the product exists
    return this.inventoryRepository.findByProduct(productId, queryParams);
  }

  /**
   * Admin UI entry point — only restock / return / adjustment / damage.
   * sale / initial are system-only (see postInitialStock / postSale*).
   */
  async postManualMovement(
    dto: CreateInventoryMovementDto,
    createdBy: string,
  ): Promise<InventoryMovementDocument> {
    const direction = this.resolveManualDirection(dto.type, dto.direction);

    return this.postMovement({
      variantId: dto.variantId,
      type: dto.type,
      quantity: dto.quantity,
      direction,
      referenceType: InventoryReferenceType.MANUAL,
      reason: dto.reason,
      createdBy,
    });
  }

  /**
   * Opening stock when a variant is created.
   * Caller should create the variant with stock=0, then call this (same session).
   */
  async postInitialStock(params: {
    variantId: Types.ObjectId | string;
    quantity: number;
    createdBy?: Types.ObjectId | string | null;
    session?: ClientSession;
  }): Promise<InventoryMovementDocument | null> {
    if (params.quantity <= 0) return null;

    return this.postMovement({
      variantId: params.variantId,
      type: InventoryMovementType.INITIAL,
      quantity: params.quantity,
      direction: InventoryDirection.IN,
      referenceType: InventoryReferenceType.VARIANT_CREATE,
      referenceId: params.variantId,
      createdBy: params.createdBy ?? null,
      session: params.session,
    });
  }

  /**
   * Fulfill a paid payment: one `sale` movement per line item.
   * Idempotent — webhook retries return existing movements (no double decrement).
   */
  async postSaleForPayment(params: {
    paymentId: Types.ObjectId | string;
    items: Array<{ variant: Types.ObjectId | string; quantity: number }>;
  }): Promise<InventoryMovementDocument[]> {
    const session = await this.connection.startSession();
    try {
      const results: InventoryMovementDocument[] = [];
      await session.withTransaction(async () => {
        for (const item of params.items) {
          const movement = await this.postMovement({
            variantId: item.variant,
            type: InventoryMovementType.SALE,
            quantity: item.quantity,
            direction: InventoryDirection.OUT,
            referenceType: InventoryReferenceType.WEBHOOK,
            referenceId: params.paymentId,
            session,
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
   * Core write path: ledger insert + cached variant.stock in one transaction.
   * Only InventoryService may mutate variant.stock.
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
      // Idempotent replay (webhook / variant_create retries)
      if (params.referenceId) {
        const existing = await this.inventoryRepository.findByIdempotencyKey({
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          variant: params.variantId,
          type: params.type,
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
      const balanceBefore = variant.stock;
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

      const nextStatus = resolveProductStatus(balanceAfter, variant.status);

      const updated = await this.variantModel
        .findOneAndUpdate(
          {
            _id: variant._id,
            deletedAt: null,
            stock: balanceBefore,
          },
          {
            $set: {
              stock: balanceAfter,
              status: nextStatus,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!updated) {
        // Concurrent stock change — fail so caller can retry
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'inventory.stockConflict',
        );
      }

      const payload: CreateMovementPersistence = {
        variant: variant._id,
        product: variant.product,
        type: params.type,
        quantity: params.quantity,
        direction: params.direction,
        delta,
        balanceBefore,
        balanceAfter,
        reason: params.reason,
        referenceType: params.referenceType,
        referenceId: params.referenceId
          ? new Types.ObjectId(String(params.referenceId))
          : null,
        createdBy: params.createdBy
          ? new Types.ObjectId(String(params.createdBy))
          : null,
      };

      try {
        return await this.inventoryRepository.create(payload, session);
      } catch (error) {
        // Race on unique idempotency index — treat as successful replay
        if (isDuplicateKeyError(error) && params.referenceId) {
          const existing = await this.inventoryRepository.findByIdempotencyKey({
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            variant: params.variantId,
            type: params.type,
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
