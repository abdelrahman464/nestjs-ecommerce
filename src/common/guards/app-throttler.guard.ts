import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { I18nHttpException } from '../filters/i18n-http.exception';

/**
 * Global rate-limit bouncer.
 *
 * Runs as APP_GUARD (before JWT in main.ts). Cheap Redis INCR first; only
 * surviving requests pay for token verify + Mongo user lookup.
 *
 * Real life: the club counts you at the door (IP) before checking your
 * name on the guest list (JWT). A crowd of fake logins never reaches the
 * guest-list desk.
 *
 * Tracker = `req.ip`. That is the real client only because main.ts sets
 * `trust proxy`. Without it, every shopper looks like Docker/nginx and
 * one bot would lock the whole store (one clipboard, one name: "proxy").
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // Express `trust proxy`: req.ips[0] is the leftmost (client) address.
    const forwarded = req.ips as string[] | undefined;
    if (forwarded?.length) {
      return forwarded[0];
    }
    return (req.ip as string | undefined) ?? 'unknown';
  }

  /**
   * Same error envelope as the rest of the API (i18n key, not the library's
   * English "Too Many Requests"). `Retry-After` is already set by the parent
   * guard — the frontend can show a countdown from that header.
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSec =
      throttlerLimitDetail.timeToBlockExpire ||
      throttlerLimitDetail.timeToExpire ||
      1;

    throw new I18nHttpException(
      HttpStatus.TOO_MANY_REQUESTS,
      'common.tooManyRequests',
      { retryAfter: retryAfterSec },
    );
  }
}
