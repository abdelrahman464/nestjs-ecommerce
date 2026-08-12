/**
 * Delivery channels (how we send).
 * In-app inbox (Mongo schema) is separate — added later beside this.
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  // SMS = 'SMS',
  // PUSH = 'PUSH',
}
