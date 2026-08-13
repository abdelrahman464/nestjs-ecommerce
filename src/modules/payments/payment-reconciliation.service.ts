import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ReservationStatus } from '../inventory/enums/reservation.enums';
import { ReservationsService } from '../inventory/reservations.service';
import { InventoryReservationDocument } from '../inventory/schemas/inventory-reservation.schema';
import { OrdersService } from '../orders/orders.service';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentDocument } from './schemas/payment.schema';
import { PaymentRepository } from './repository/payment.repository';
import { PaymentsService } from './payments.service';
import { PaymentStrategyRegistry } from './strategies/payment-strategy.registry';

/** Grace window bought when a rescue succeeds, just so the normal confirm path doesn't also see this reservation as expired. */
const RESCUE_GRACE_MS = 5 * 60_000; // 5 minutes

/** Backoff schedule for re-polling a stuck PENDING Stripe payment: 2m, 4m, 8m, ... capped at 30m. */
const BASE_DELAY_MS = 60_000; // 1 minute
const MAX_DELAY_MS = 30 * 60_000; // 30 minutes

/**
 * Catches stale payments / expired reservations.
 *
 * Triggered by BullMQ every minute (PaymentReconciliationScheduler),
 * not by @nestjs/schedule @Cron anymore.
 * Status changes still go through PaymentsService.applyStatusTransition.
 */
@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly reservationsService: ReservationsService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly strategyRegistry: PaymentStrategyRegistry,
    @InjectPinoLogger(PaymentReconciliationService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Called by PaymentReconciliationProcessor for each "sweep" job. */
  async sweep(): Promise<void> {
    await this.expireStaleReservations();
    await this.reconcilePendingPayments();
  }

  /**
   * Release stock + cancel order + expire payment for reservations past
   * their TTL — unless a last-chance provider check shows the payment
   * actually already succeeded (see `tryRescueBeforeExpiry`).
   */
  private async expireStaleReservations(): Promise<void> {
    const expired = await this.reservationsService.findExpiredPending(
      new Date(),
    );

    for (const reservation of expired) {
      try {
        const payment = await this.paymentRepository.findPaymentById(
          reservation.payment,
        );

        
        if (
          payment &&
          payment.status === PaymentStatus.PENDING &&
          (await this.tryRescueBeforeExpiry(payment, reservation))
        ) {
          continue; // paid at the provider — fulfilled instead of expired
        }

        await this.reservationsService.releaseByOrderId(
          reservation.order,
          ReservationStatus.EXPIRED,
        );
        await this.ordersService.markCancelled(reservation.order);
        await this.paymentRepository.updateStatus(
          reservation.payment,
          PaymentStatus.EXPIRED,
        );
      } catch (error) {
        this.logger.error(
          {
            reservationId: reservation._id.toString(),
            paymentId: reservation.payment?.toString(),
            err: error instanceof Error ? error.message : String(error),
          },
          'Failed to expire reservation',
        );
      }
    }
  }

  /**
   * Last chance before we release stock: ask the provider directly whether
   * this "expired by the clock" payment actually went through — closes the
   * race where a slow checkout (3D Secure, bank redirect) completes just
   * after the reservation TTL. Returns true if it was rescued (fulfilled),
   * false if it should proceed to expire as normal.
   */
  private async tryRescueBeforeExpiry(
    payment: PaymentDocument,
    reservation: InventoryReservationDocument,
  ): Promise<boolean> {
    // Manual payments (and any provider without a registered strategy) have
    // no online status to poll — nothing to "rescue", go straight to expiry.
    if (!this.strategyRegistry.has(payment.provider)) return false;

    const strategy = this.strategyRegistry.get(payment.provider);
    if (!strategy.getStatus || !payment.providerReference) return false;

    const status = await strategy.getStatus(payment.providerReference);
    if (status !== PaymentStatus.PAID) return false;

    this.logger.warn(
      {
        paymentId: payment._id.toString(),
        reservationId: reservation._id.toString(),
        provider: payment.provider,
      },
      'Rescuing PAID payment at reservation expiry',
    );

    // Stock is still held (we haven't released it yet) — just push the
    // clock forward so confirmByOrderId's own expiry check doesn't also
    // treat this as expired when the normal confirm path runs below.
    await this.reservationsService.extendExpiry(
      reservation._id,
      new Date(Date.now() + RESCUE_GRACE_MS),
    );
    await this.paymentsService.applyStatusTransition(payment, status);
    return true;
  }

  /** Poll providers for PENDING payments whose backoff window is due, apply any status change. */
  private async reconcilePendingPayments(): Promise<void> {
    const due = await this.paymentRepository.findDueForReconciliation(
      new Date(),
    );

    for (const payment of due) {
      try {
        const strategy = this.strategyRegistry.get(payment.provider);
        if (!strategy.getStatus || !payment.providerReference) continue;

        const status = await strategy.getStatus(payment.providerReference);

        if (status === PaymentStatus.PENDING) {
          // increment the attempts count 
          const attempts = (payment.reconciliationAttempts ?? 0) + 1;
          // calculate the delay based on the attempts count using exponential backoff 
          const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
          await this.paymentRepository.bumpReconciliation(
            payment._id,
            new Date(Date.now() + delayMs),
            attempts,
          );
          continue;
        }

        await this.paymentsService.applyStatusTransition(payment, status);
      } catch (error) {
        this.logger.error(
          {
            paymentId: payment._id.toString(),
            provider: payment.provider,
            err: error instanceof Error ? error.message : String(error),
          },
          'Failed to reconcile payment',
        );
      }
    }
  }
}
