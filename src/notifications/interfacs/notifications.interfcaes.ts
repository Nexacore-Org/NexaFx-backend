import { NotificationChannel } from '../enum/notificationChannel.enum';
import { NotificationType } from '../enum/notificationType.enum';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any>;
}

export interface SwapCompletedEvent {
  userId: string;
  swapId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
  toAmount: number;
  timestamp: Date;
}

export interface WalletUpdatedEvent {
  userId: string;
  walletId: string;
  asset: string;
  previousBalance: number;
  newBalance: number;
  reason: string;
  timestamp: Date;
}

export interface TransactionFailedEvent {
  userId: string;
  transactionId: string;
  asset: string;
  amount: number;
  reason: string;
  timestamp: Date;
}
