import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { WAREHOUSE_SEARCH_FIELDS } from '../constants/warehouse.constants';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { Warehouse, WarehouseDocument } from '../schemas/warehouse.schema';

const NOT_DELETED = { deletedAt: null };

@Injectable()
export class WarehousesRepository {
  constructor(
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
  ) {}

  async create(
    data: CreateWarehouseDto & { code: string; isDefault: boolean },
    session?: ClientSession,
  ): Promise<WarehouseDocument> {
    const [doc] = await this.warehouseModel.create([data], { session });
    return doc;
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<WarehouseDocument | null> {
    return this.warehouseModel.findOne({ _id: id, ...NOT_DELETED }).exec();
  }

  async findByCode(code: string): Promise<WarehouseDocument | null> {
    return this.warehouseModel
      .findOne({ code: code.toUpperCase(), ...NOT_DELETED })
      .exec();
  }

  async findDefault(
    session?: ClientSession,
  ): Promise<WarehouseDocument | null> {
    return this.warehouseModel
      .findOne({ isDefault: true, ...NOT_DELETED })
      .session(session ?? null)
      .exec();
  }

  async countNotDeleted(session?: ClientSession): Promise<number> {
    return this.warehouseModel
      .countDocuments(NOT_DELETED)
      .session(session ?? null)
      .exec();
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<WarehouseDocument>> {
    const features = new ApiFeatures<WarehouseDocument>(
      this.warehouseModel.find(NOT_DELETED),
      queryParams,
      this.warehouseModel,
    );
    return features
      .filter()
      .search(WAREHOUSE_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async update(
    id: Types.ObjectId | string,
    dto: UpdateWarehouseDto & { code?: string },
    session?: ClientSession,
  ): Promise<WarehouseDocument | null> {
    const $set = flattenObject(dto as Record<string, unknown>);
    return this.warehouseModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set },
        { new: true, runValidators: true, session },
      )
      .exec();
  }

  async clearDefaultFlag(session?: ClientSession): Promise<void> {
    await this.warehouseModel
      .updateMany(
        { isDefault: true, ...NOT_DELETED },
        { $set: { isDefault: false } },
        { session },
      )
      .exec();
  }

  async softDelete(id: Types.ObjectId | string): Promise<void> {
    await this.warehouseModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set: { deletedAt: new Date(), isDefault: false } },
      )
      .exec();
  }
}
