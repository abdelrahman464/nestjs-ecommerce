/** Queue name stored in Redis as bull:email:* */
export const EMAIL_QUEUE = 'email';

/** Job name inside the email queue */
export const EMAIL_JOB_SEND = 'send';

/** Data we put on each email job (already rendered) */
export type EmailJobPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};
