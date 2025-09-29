// src/notification-preferences/dto/notification-preference.dto.ts
export class NotificationPreferenceDto {
  id: string;
  userId: string;
  notifyOnTx: boolean;
  notifyOnAnnouncements: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
