import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { WarehousesService } from '../warehouses/warehouses.service';
import { WarehouseDocument } from '../warehouses/schemas/warehouse.schema';
import { RESERVATION_TTL_MS } from './constants/reservation.constants';
import { InventoryDirection } from './enums/inventory-direction.enum';
import { InventoryMovementType } from './enums/inventory-movement-type.enum';
import { InventoryReferenceType } from './enums/inventory-reference-type.enum';
import {
  ReservationSource,
  ReservationStatus,
} from './enums/reservation.enums';
import { InventoryService } from './inventory.service';
import { InventoryLevelsRepository } from './repository/inventory-levels.repository';
import { ReservationsRepository } from './repository/reservations.repository';
import { InventoryReservationDocument } from './schemas/inventory-reservation.schema';
import { ReservationLine } from './schemas/reservation-line.schema';

export type ReserveItemInput = {
  variantId: Types.ObjectId | string;
  productId: Types.ObjectId | string;
  quantity: number;
};

export type ReservationCreateParams = {
  userId: Types.ObjectId | string;
  createdBy: Types.ObjectId | string;
  source: ReservationSource;
  orderId: Types.ObjectId | string;
  paymentId: Types.ObjectId | string;
  items: ReserveItemInput[];
  session?: ClientSession;
};

export type VariantAvailability = {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  byWarehouse: Array<{
    warehouseId: string;
    code?: string;
    onHand: number;
    reserved: number;
    available: number;
  }>;
};

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly levelsRepository: InventoryLevelsRepository,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryService: InventoryService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findById(id: Types.ObjectId): Promise<InventoryReservationDocument> {
    const reservation = await this.reservationsRepository.findById(id);
    if (!reservation) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'reservation.notFound',
        { id: id.toString() },
      );
    }
    return reservation;
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
  ): Promise<InventoryReservationDocument> {
    const reservation =
      await this.reservationsRepository.findByOrderId(orderId);
    if (!reservation) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'reservation.notFoundForOrder',
        { orderId: String(orderId) },
      );
    }
    return reservation;
  }

  async getAvailability(variantId: string): Promise<VariantAvailability> {
    const levels = await this.levelsRepository.findByVariant(variantId);
    const warehouses = await this.warehousesService.findActiveSorted();
    const warehouseMap = new Map(warehouses.map((w) => [w._id.toString(), w]));

    let onHand = 0;
    let reserved = 0;
    const byWarehouse: VariantAvailability['byWarehouse'] = [];

    for (const level of levels) {
      const whId = level.warehouse.toString();
      const wh = warehouseMap.get(whId);
      const avail = Math.max(0, level.quantity - level.reservedQuantity);
      onHand += level.quantity;
      reserved += level.reservedQuantity;
      byWarehouse.push({
        warehouseId: whId,
        code: wh?.code,
        onHand: level.quantity,
        reserved: level.reservedQuantity,
        available: avail,
      });
    }

    return {
      variantId,
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      byWarehouse,
    };
  }

  /** Used by product/variant deletion guards — true if any variant still has a pending reservation. */
  async hasPendingReservation(
    variantIds: Array<Types.ObjectId | string>,
  ): Promise<boolean> {
    return this.reservationsRepository.existsPendingForVariants(variantIds);
  }

  async assertAvailable(items: ReserveItemInput[]): Promise<void> {
    for (const item of items) {
      const availability = await this.getAvailability(String(item.variantId));
      if (item.quantity > availability.available) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'reservation.insufficientAvailable',
          {
            variantId: String(item.variantId),
            available: availability.available,
            requested: item.quantity,
          },
        );
      }
    }
  }

  /**
   * Allocation (no DB writes):
   * 1) Put default warehouse first among active warehouses
   * 2) Then remaining warehouses by `order`
   * 3) Greedy fill each level's available until qty is met
   */
  async allocate(items: ReserveItemInput[]): Promise<ReservationLine[]> {
    const warehouses = await this.orderedWarehousesForAllocation();
    const lines: ReservationLine[] = [];

    for (const item of items) {
      let remaining = item.quantity;
      const levels = await this.levelsRepository.findByVariant(item.variantId);
      const levelByWh = new Map(levels.map((l) => [l.warehouse.toString(), l]));

      for (const warehouse of warehouses) {
        if (remaining <= 0) break;
        const level = levelByWh.get(warehouse._id.toString());
        // if there is no level for the current warehouse, continue to the next warehouse
        if (!level) continue;

        const available = Math.max(
          0,
          level.quantity - (level.reservedQuantity ?? 0),
        );
        // if there is no available quantity, continue to the next warehouse
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        lines.push({
          variant: new Types.ObjectId(String(item.variantId)),
          product: new Types.ObjectId(String(item.productId)),
          warehouse: warehouse._id,
          quantity: take,
        });
        remaining -= take;
      }

      if (remaining > 0) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'reservation.insufficientAvailable',
          {
            variantId: String(item.variantId),
            available: item.quantity - remaining,
            requested: item.quantity,
          },
        );
      }
    }

    return lines;
  }

  /**
   * Create reservation + bump reservedQuantity per line in one TX.
   * Caller supplies orderId + paymentId (both required).
   */
  async createReservation(
    params: ReservationCreateParams,
  ): Promise<InventoryReservationDocument> {
    const ttlMs =
      params.source === ReservationSource.MANUAL_ORDER
        ? RESERVATION_TTL_MS.manual_order
        : RESERVATION_TTL_MS.checkout;

    const run = async (session: ClientSession) => {
      const lines = await this.allocate(params.items);

      // Hold stock at each allocated warehouse (atomic available check).
      for (const line of lines) {
        const updated = await this.levelsRepository.increaseReserved({
          variantId: line.variant,
          warehouseId: line.warehouse,
          qty: line.quantity,
          session,
        });
        if (!updated) {
          throw new I18nHttpException(
            HttpStatus.CONFLICT,
            'reservation.reserveConflict',
          );
        }
      }

      return this.reservationsRepository.create(
        {
          user: new Types.ObjectId(String(params.userId)),
          createdBy: new Types.ObjectId(String(params.createdBy)),
          source: params.source,
          order: new Types.ObjectId(String(params.orderId)),
          payment: new Types.ObjectId(String(params.paymentId)),
          status: ReservationStatus.PENDING,
          expiresAt: new Date(Date.now() + ttlMs),
          lines,
        },
        session,
      );
    };

    if (params.session) {
      return run(params.session);
    }

    const session = await this.connection.startSession();
    try {
      let created!: InventoryReservationDocument;
      await session.withTransaction(async () => {
        created = await run(session);
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Payment PAID path:
   * 1) Ensure pending + not expired (else expire+release)
   * 2) For each line: decreaseReserved then postMovement SALE
   * 3) Mark reservation confirmed
   *
   * Sales use referenceId = orderId (idempotent on webhook retry).
   */
  async confirmByOrderId(params: {
    orderId: Types.ObjectId | string;
    referenceType:
      | InventoryReferenceType.WEBHOOK
      | InventoryReferenceType.MANUAL_ORDER;
    movementCreatedBy: Types.ObjectId | string;
  }): Promise<InventoryReservationDocument> {
    const session = await this.connection.startSession();
    try {
      let result!: InventoryReservationDocument;
      await session.withTransaction(async () => {
        const reservation = await this.reservationsRepository.findByOrderId(
          params.orderId,
          session,
        );
        if (!reservation) {
          throw new I18nHttpException(
            HttpStatus.NOT_FOUND,
            'reservation.notFoundForOrder',
            { orderId: String(params.orderId) },
          );
        }

        if (reservation.status === ReservationStatus.CONFIRMED) {
          result = reservation;
          return;
        }

        if (
          reservation.status === ReservationStatus.EXPIRED ||
          reservation.status === ReservationStatus.RELEASED
        ) {
          throw new I18nHttpException(
            HttpStatus.BAD_REQUEST,
            'reservation.cannotConfirm',
            { status: reservation.status },
          );
        }

        // if reservation is expired, release the lines and update the status to expired
        if (reservation.expiresAt.getTime() < Date.now()) {
          await this.releaseLines(reservation.lines, session);
          await this.reservationsRepository.updateStatus(
            reservation._id,
            ReservationStatus.EXPIRED,
            { releasedAt: new Date() },
            session,
          );
          throw new I18nHttpException(
            HttpStatus.BAD_REQUEST,
            'reservation.expired',
          );
        }

        // for each line, decrease the reserved quantity and post a sale movement
        for (const line of reservation.lines) {
          const freed = await this.levelsRepository.decreaseReserved({
            variantId: line.variant,
            warehouseId: line.warehouse,
            qty: line.quantity,
            session,
          });
          if (!freed) {
            throw new I18nHttpException(
              HttpStatus.CONFLICT,
              'reservation.reserveConflict',
            );
          }

          await this.inventoryService.postMovement({
            variantId: line.variant,
            warehouseId: line.warehouse,
            type: InventoryMovementType.SALE,
            quantity: line.quantity,
            direction: InventoryDirection.OUT,
            referenceType: params.referenceType,
            referenceId: params.orderId,
            createdBy: params.movementCreatedBy,
            session,
            skipWarehouseAssert: true,
          });
        }

        const updated = await this.reservationsRepository.updateStatus(
          reservation._id,
          ReservationStatus.CONFIRMED,
          { confirmedAt: new Date() },
          session,
        );
        result = updated!;
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async releaseByOrderId(
    orderId: Types.ObjectId | string,
    as:
      | ReservationStatus.RELEASED
      | ReservationStatus.EXPIRED = ReservationStatus.RELEASED,
  ): Promise<InventoryReservationDocument | null> {
    const session = await this.connection.startSession();
    try {
      let result: InventoryReservationDocument | null = null;
      await session.withTransaction(async () => {
        const reservation = await this.reservationsRepository.findByOrderId(
          orderId,
          session,
        );
        if (!reservation) return;

        if (reservation.status !== ReservationStatus.PENDING) {
          result = reservation;
          return;
        }

        await this.releaseLines(reservation.lines, session);
        result = await this.reservationsRepository.updateStatus(
          reservation._id,
          as,
          { releasedAt: new Date() },
          session,
        );
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async releaseById(id: Types.ObjectId): Promise<InventoryReservationDocument> {
    const reservation = await this.findById(id);
    const released = await this.releaseByOrderId(reservation.order);
    if (!released) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'reservation.notFound',
        { id: id.toString() },
      );
    }
    return released;
  }

  private async releaseLines(
    lines: ReservationLine[],
    session: ClientSession,
  ): Promise<void> {
    for (const line of lines) {
      const updated = await this.levelsRepository.decreaseReserved({
        variantId: line.variant,
        warehouseId: line.warehouse,
        qty: line.quantity,
        session,
      });
      if (!updated) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'reservation.reserveConflict',
        );
      }
    }
  }

  /** Default warehouse first, then others by order. */
  private async orderedWarehousesForAllocation(): Promise<WarehouseDocument[]> {
    const warehouses = await this.warehousesService.findActiveSorted();
    if (!warehouses.length) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'warehouse.noDefault',
      );
    }

    const defaultWh = warehouses.find((w) => w.isDefault);
    if (!defaultWh) {
      return warehouses;
    }

    return [
      defaultWh,
      ...warehouses.filter((w) => !w._id.equals(defaultWh._id)),
    ];
  }
}
