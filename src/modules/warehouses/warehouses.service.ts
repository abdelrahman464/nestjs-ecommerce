import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import {
  getDuplicateKeyField,
  isDuplicateKeyError,
} from '../../common/utils/mongo-error.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import {
  InventoryLevel,
  InventoryLevelDocument,
} from '../inventory/schemas/inventory-level.schema';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesRepository } from './repository/warehouses.repository';
import { WarehouseDocument } from './schemas/warehouse.schema';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly warehousesRepository: WarehousesRepository,
    @InjectModel(InventoryLevel.name)
    private readonly levelModel: Model<InventoryLevelDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<WarehouseDocument>> {
    return this.warehousesRepository.findAll(queryParams);
  }

  async findOne(id: Types.ObjectId): Promise<WarehouseDocument> {
    const warehouse = await this.warehousesRepository.findById(id);
    if (!warehouse) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'warehouse.notFound', {
        id: id.toString(),
      });
    }
    return warehouse;
  }

  /**
   * Create warehouse. First live warehouse is always default.
   * Setting isDefault clears any previous default in the same TX.
   */
  async create(dto: CreateWarehouseDto): Promise<WarehouseDocument> {
    const code = dto.code.trim().toUpperCase();
    await this.assertCodeAvailable(code);

    const session = await this.connection.startSession();
    try {
      let created!: WarehouseDocument;
      await session.withTransaction(async () => {
        const count = await this.warehousesRepository.countNotDeleted(session);
        const isDefault = count === 0 ? true : dto.isDefault === true;

        if (isDefault) {
          await this.warehousesRepository.clearDefaultFlag(session);
        }

        created = await this.warehousesRepository.create(
          {
            ...dto,
            code,
            isDefault,
            isActive: dto.isActive ?? true,
            order: dto.order ?? 0,
          },
          session,
        );
      });
      return created;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateWarehouseDto,
  ): Promise<WarehouseDocument> {
    const existing = await this.findOne(id);

    if (dto.isDefault === false && existing.isDefault) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.cannotUnsetDefault',
      );
    }

    const code =
      dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined;
    if (code && code !== existing.code) {
      await this.assertCodeAvailable(code);
    }

    const session = await this.connection.startSession();
    try {
      let updated!: WarehouseDocument | null;
      await session.withTransaction(async () => {
        if (dto.isDefault === true && !existing.isDefault) {
          await this.warehousesRepository.clearDefaultFlag(session);
        }

        updated = await this.warehousesRepository.update(
          id,
          {
            ...dto,
            ...(code !== undefined ? { code } : {}),
          },
          session,
        );
      });

      if (!updated) {
        throw new I18nHttpException(HttpStatus.NOT_FOUND, 'warehouse.notFound', {
          id: id.toString(),
        });
      }
      return updated;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Soft-delete guards: not last, not default, no positive stock at this location.
   * Uses InventoryLevel model directly to avoid Warehouses ↔ Inventory circular modules.
   */
  async remove(id: Types.ObjectId): Promise<void> {
    const existing = await this.findOne(id);

    if (existing.isDefault) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.cannotDeleteDefault',
      );
    }

    const count = await this.warehousesRepository.countNotDeleted();
    if (count <= 1) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.cannotDeleteLast',
      );
    }

    const hasStock = await this.levelModel.exists({
      warehouse: id,
      quantity: { $gt: 0 },
    });
    if (hasStock) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.cannotDeleteWithStock',
      );
    }

    await this.warehousesRepository.softDelete(id);
  }

  /** Default warehouse for initial stock + MVP sales. */
  async getDefault(): Promise<WarehouseDocument> {
    const warehouse = await this.warehousesRepository.findDefault();
    if (!warehouse) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.noDefault',
      );
    }
    return warehouse;
  }

  /**
   * Stock writes must target an active, non-deleted warehouse.
   */
  async assertUsable(
    id: Types.ObjectId | string,
  ): Promise<WarehouseDocument> {
    const warehouse = await this.warehousesRepository.findById(id);
    if (!warehouse) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'warehouse.notFound', {
        id: String(id),
      });
    }
    if (!warehouse.isActive) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.inactive',
        { id: String(id) },
      );
    }
    return warehouse;
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.warehousesRepository.findByCode(code);
    if (existing) {
      throw new I18nHttpException(HttpStatus.CONFLICT, 'warehouse.codeExists', {
        code,
      });
    }
  }

  private rethrowDuplicateKey(error: unknown): void {
    if (!isDuplicateKeyError(error)) return;
    const field = getDuplicateKeyField(error);
    if (field === 'code') {
      throw new I18nHttpException(HttpStatus.CONFLICT, 'warehouse.codeExists', {
        code: '',
      });
    }
    if (field === 'isDefault') {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'warehouse.defaultConflict',
      );
    }
  }
}
