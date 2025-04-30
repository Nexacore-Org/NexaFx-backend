// src/notification-preferences/notification-preferences.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from './entities/notification-preference.entity';
import { CreateNotificationPreferenceDto } from './dto/create-notification-preference.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private notificationPreferenceRepository: Repository<NotificationPreference>,
  ) {}

  async create(createDto: CreateNotificationPreferenceDto): Promise<NotificationPreference> {
    const existingPreferences = await this.notificationPreferenceRepository.findOne({
      where: { userId: createDto.userId },
    });

    if (existingPreferences) {
      throw new Error('Notification preferences already exist for this user');
    }

    const preferences = this.notificationPreferenceRepository.create({
      ...createDto,
      // Set default values if not provided
      notifyOnTx: createDto.notifyOnTx ?? true,
      notifyOnAnnouncements: createDto.notifyOnAnnouncements ?? true,
      emailEnabled: createDto.emailEnabled ?? true,
      smsEnabled: createDto.smsEnabled ?? false,
      pushEnabled: createDto.pushEnabled ?? true,
    });

    return this.notificationPreferenceRepository.save(preferences);
  }

  async findByUserId(userId: string): Promise<NotificationPreference> {
    const preferences = await this.notificationPreferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Apply default settings for new users
      const defaultPreferences = this.notificationPreferenceRepository.create({
        userId,
        notifyOnTx: true,
        notifyOnAnnouncements: true,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
      });
      return this.notificationPreferenceRepository.save(defaultPreferences);
    }

    return preferences;
  }

  async update(
    userId: string,
    updateDto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreference> {
    const preferences = await this.notificationPreferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create with defaults + updates if preferences don't exist
      const newPreferences = this.notificationPreferenceRepository.create({
        userId,
        notifyOnTx: updateDto.notifyOnTx ?? true,
        notifyOnAnnouncements: updateDto.notifyOnAnnouncements ?? true,
        emailEnabled: updateDto.emailEnabled ?? true,
        smsEnabled: updateDto.smsEnabled ?? false,
        pushEnabled: updateDto.pushEnabled ?? true,
      });
      return this.notificationPreferenceRepository.save(newPreferences);
    }

    // Update only the fields that are provided
    Object.assign(preferences, updateDto);
    return this.notificationPreferenceRepository.save(preferences);
  }
}