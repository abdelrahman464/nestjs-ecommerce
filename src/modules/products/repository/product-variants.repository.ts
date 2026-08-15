import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import {
  EntityMediaStore,
  mongooseMediaStore,
} from '../../media/entity-media.store';
import { CreateProductVariantPersistence } from '../dto/create-product-variant.dto';
import { ReorderVariantItemDto } from '../dto/reorder-variants.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../schemas/product-variant.schema';

const NOT_DELETED = { deletedAt: null };

@Injectable()
export class ProductVariantRepository {
  constructor(
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariantDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  mediaStore(): EntityMediaStore {
    return mongooseMediaStore(this.variantModel);
  }

  async findByProductId(
    productId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ProductVariantDocument[]> {
    return this.variantModel
      .find({ product: productId, ...NOT_DELETED })
      .session(session ?? null)
      .sort({ order: 1, createdAt: 1 })
      .exec();
  }

  async findById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOne({ _id: id, ...NOT_DELETED })
      .session(session ?? null)
      .exec();
  }

  async findByIdAndProduct(
    id: Types.ObjectId | string,
    productId: Types.ObjectId | string,
  ): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOne({ _id: id, product: productId, ...NOT_DELETED })
      .exec();
  }

  async findBySku(sku: string): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOne({ sku: sku.toUpperCase(), ...NOT_DELETED })
      .exec();
  }

  async findByBarcode(barcode: string): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOne({ barcode: barcode.trim(), ...NOT_DELETED })
      .exec();
  }

  async findDefaultByProduct(
    productId: Types.ObjectId | string,
  ): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOne({ product: productId, isDefault: true, ...NOT_DELETED })
      .exec();
  }

  async countByProduct(productId: Types.ObjectId | string): Promise<number> {
    return this.variantModel
      .countDocuments({ product: productId, ...NOT_DELETED })
      .exec();
  }

  async getMaxOrder(productId: Types.ObjectId | string): Promise<number> {
    const variant = await this.variantModel
      .findOne({ product: productId, ...NOT_DELETED })
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();
    return variant?.order ?? 0;
  }

  async createVariant(
    data: CreateProductVariantPersistence,
    session?: ClientSession,
  ): Promise<ProductVariantDocument> {
    const [variant] = await this.variantModel.create([data], { session });
    return variant;
  }

  async createVariants(
    data: CreateProductVariantPersistence[],
    session?: ClientSession,
  ): Promise<ProductVariantDocument[]> {
    return this.variantModel.insertMany(data, { session });
  }

  async updateVariant(
    id: Types.ObjectId | string,
    dto: UpdateProductVariantDto & {
      optionsKey?: string;
      options?: Record<string, string>;
      status?: string;
    },
    session?: ClientSession,
  ): Promise<ProductVariantDocument | null> {
    const $set = flattenObject(dto as Record<string, unknown>);
    return this.variantModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set },
        { new: true, runValidators: true, session },
      )
      .exec();
  }

  async clearDefaultFlag(
    productId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.variantModel
      .updateMany(
        { product: productId, isDefault: true, ...NOT_DELETED },
        { $set: { isDefault: false } },
        { session: session ?? null },
      )
      .exec();
  }

  async reorderVariants(
    productId: Types.ObjectId | string,
    items: ReorderVariantItemDto[],
  ): Promise<ProductVariantDocument[]> {
    const session = await this.connection.startSession();
    try {
      let updated: ProductVariantDocument[] = [];
      await session.withTransaction(async () => {
        const ops = items.map((item) => ({
          updateOne: {
            filter: {
              _id: item.variantId,
              product: productId,
              ...NOT_DELETED,
            },
            update: { $set: { order: item.order } },
          },
        }));
        // bulkWrite write all the operations at one request to the database - so this is much faster than calling updateOne for each item
        await this.variantModel.bulkWrite(ops, { session });
        updated = await this.findByProductId(productId, session);
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  async softDeleteVariant(id: Types.ObjectId | string): Promise<void> {
    await this.variantModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set: { deletedAt: new Date(), isDefault: false } },
      )
      .exec();
  }

  async softDeleteByProduct(
    productId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.variantModel
      .updateMany(
        { product: productId, ...NOT_DELETED },
        { $set: { deletedAt: new Date(), isDefault: false } },
        { session },
      )
      .exec();
  }

  async decrementStock(
    id: Types.ObjectId | string,
    quantity: number,
  ): Promise<ProductVariantDocument | null> {
    return this.variantModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED, stock: { $gte: quantity } },
        [
          {
            $set: {
              stock: { $subtract: ['$stock', quantity] },
              status: {
                $cond: [
                  { $lte: [{ $subtract: ['$stock', quantity] }, 0] },
                  'outOfStock',
                  '$status',
                ],
              },
            },
          },
        ],
        { new: true },
      )
      .exec();
  }
}
