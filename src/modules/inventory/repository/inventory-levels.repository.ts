import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import {
  InventoryLevel,
  InventoryLevelDocument,
} from '../schemas/inventory-level.schema';

@Injectable()
export class InventoryLevelsRepository {
  constructor(
    @InjectModel(InventoryLevel.name)
    private readonly levelModel: Model<InventoryLevelDocument>,
  ) {}

  async findByVariantAndWarehouse(
    variantId: Types.ObjectId | string,
    warehouseId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<InventoryLevelDocument | null> {
    return this.levelModel
      .findOne({ variant: variantId, warehouse: warehouseId })
      .session(session ?? null)
      .exec();
  }

  async findByVariant(
    variantId: Types.ObjectId | string,
  ): Promise<InventoryLevelDocument[]> {
    return this.levelModel.find({ variant: variantId }).exec();
  }

  async findByWarehouse(
    warehouseId: Types.ObjectId | string,
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<InventoryLevelDocument>> {
    const features = new ApiFeatures<InventoryLevelDocument>(
      this.levelModel.find({ warehouse: warehouseId }),
      queryParams,
      this.levelModel,
    );
    return features.filter().sort().paginate().executePaginated();
  }

  /**
   * Apply delta to a level inside an open session.
   *
   * - Missing row + inbound (delta > 0): create with quantity = delta.
   * - Existing row: optimistic lock on quantity === balanceBefore.
   * - Outbound with no row / not enough qty: returns null (caller maps to 400).
   */
  async applyDelta(params: {
    variantId: Types.ObjectId;
    productId: Types.ObjectId;
    warehouseId: Types.ObjectId | string;
    delta: number;
    balanceBefore: number;
    session: ClientSession;
  }): Promise<InventoryLevelDocument | null> {
    const { variantId, productId, warehouseId, delta, balanceBefore, session } =
      params;
    const balanceAfter = balanceBefore + delta;

    if (balanceBefore === 0 && delta > 0) {
      const existing = await this.findByVariantAndWarehouse(
        variantId,
        warehouseId,
        session,
      );
      if (!existing) {
        const [created] = await this.levelModel.create(
          [
            {
              variant: variantId,
              product: productId,
              warehouse: warehouseId,
              quantity: balanceAfter,
            },
          ],
          { session },
        );
        return created;
      }
    }

    return this.levelModel
      .findOneAndUpdate(
        {
          variant: variantId,
          warehouse: warehouseId,
          quantity: balanceBefore,
        },
        { $set: { quantity: balanceAfter } },
        { new: true, session },
      )
      .exec();
  }
}
