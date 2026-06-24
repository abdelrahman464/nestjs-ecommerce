export interface INotificationStrategy {
  name: string;
  send(to: string, subject: string, message: string): Promise<void>;
}
