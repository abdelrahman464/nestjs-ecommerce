//******************************************************************************************** */
/** Queue name stored in Redis as bull:email:* */
export const EMAIL_QUEUE = 'email';

/** Job name inside the email queue */
export const EMAIL_JOB_SEND = 'send';

/** Data we put on each email job  */
export type EmailJobPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};
//******************************************************************************************** */

//******************************************************************************************** */
/** Queue name: bull:payment-reconciliation:* */
export const PAYMENT_RECONCILIATION_QUEUE = 'payment-reconciliation';

/** Job name produced every minute by the scheduler */
export const PAYMENT_RECONCILIATION_JOB_SWEEP = 'sweep';

/** Scheduler id in Redis (BullMQ dedupes by this — one timer for all app instances) */
export const PAYMENT_RECONCILIATION_SCHEDULER_ID =
  'payment-reconciliation-sweep';

/** How often to enqueue a sweep job */
export const PAYMENT_RECONCILIATION_EVERY_MS = 60_000; // 1 minute
//******************************************************************************************** */
