// src/notification-preferences/repositories/notification-preference.repository.ts
import { EntityRepository, Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';

@EntityRepository(NotificationPreference)
export class NotificationPreferenceRepository extends Repository<NotificationPreference> {
  async findByUserId(userId: string): Promise<NotificationPreference> {
    return this.findOne({ where: { userId } });
  }
}