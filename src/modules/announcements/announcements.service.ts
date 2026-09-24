import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import {
  Announcement,
  AnnouncementType,
  AnnouncementAudience,
} from './entities/announcement.entity';
import { AnnouncementAcknowledgment } from './entities/announcement-acknowledgment.entity';

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  type?: AnnouncementType;
  startsAt: Date;
  endsAt?: Date;
  requiresAcknowledgment?: boolean;
  targetAudience?: AnnouncementAudience;
}

export interface AnnouncementResponseDto {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  requiresAcknowledgment: boolean;
  targetAudience: AnnouncementAudience;
  createdBy: string;
  createdAt: Date;
  acknowledged?: boolean;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(AnnouncementAcknowledgment)
    private readonly acknowledgmentRepo: Repository<AnnouncementAcknowledgment>,
  ) {}

  async create(
    dto: CreateAnnouncementDto,
    createdBy: string,
  ): Promise<AnnouncementResponseDto> {
    const announcement = this.announcementRepo.create({
      title: dto.title,
      body: dto.body,
      type: dto.type || AnnouncementType.INFO,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt || null,
      requiresAcknowledgment: dto.requiresAcknowledgment ?? false,
      targetAudience: dto.targetAudience || AnnouncementAudience.ALL,
      createdBy,
      isActive: true,
    });

    const saved = await this.announcementRepo.save(announcement);
    return this.toResponseDto(saved);
  }

  async findActiveForUser(
    userId: string,
    userRole: string,
  ): Promise<AnnouncementResponseDto[]> {
    const now = new Date();

    const announcements = await this.announcementRepo.find({
      where: {
        isActive: true,
        startsAt: LessThanOrEqual(now),
      },
      order: { createdAt: 'DESC' },
    });

    const filtered = announcements.filter((a) => {
      if (a.endsAt && a.endsAt < now) {
        return false;
      }

      switch (a.targetAudience) {
        case AnnouncementAudience.ALL:
          return true;
        case AnnouncementAudience.ADMINS:
          return userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
        case AnnouncementAudience.KYC_APPROVED:
          return true;
        default:
          return true;
      }
    });

    const acknowledgmentIds = new Set(
      (
        await this.acknowledgmentRepo.find({
          where: { userId },
        })
      ).map((a) => a.announcementId),
    );

    return filtered.map((a) => ({
      ...this.toResponseDto(a),
      acknowledged: acknowledgmentIds.has(a.id),
    }));
  }

  async acknowledge(
    announcementId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const announcement = await this.announcementRepo.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const existing = await this.acknowledgmentRepo.findOne({
      where: { announcementId, userId },
    });

    if (existing) {
      return { success: true };
    }

    const acknowledgment = this.acknowledgmentRepo.create({
      announcementId,
      userId,
    });

    await this.acknowledgmentRepo.save(acknowledgment);
    return { success: true };
  }

  async findAll(): Promise<AnnouncementResponseDto[]> {
    const announcements = await this.announcementRepo.find({
      order: { createdAt: 'DESC' },
    });
    return announcements.map((a) => this.toResponseDto(a));
  }

  async update(
    id: string,
    updates: Partial<CreateAnnouncementDto>,
  ): Promise<AnnouncementResponseDto> {
    const announcement = await this.announcementRepo.findOne({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    Object.assign(announcement, updates);
    const saved = await this.announcementRepo.save(announcement);
    return this.toResponseDto(saved);
  }

  async deactivate(id: string): Promise<{ success: boolean }> {
    const announcement = await this.announcementRepo.findOne({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    announcement.isActive = false;
    await this.announcementRepo.save(announcement);
    return { success: true };
  }

  private toResponseDto(announcement: Announcement): AnnouncementResponseDto {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      type: announcement.type,
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
      isActive: announcement.isActive,
      requiresAcknowledgment: announcement.requiresAcknowledgment,
      targetAudience: announcement.targetAudience,
      createdBy: announcement.createdBy,
      createdAt: announcement.createdAt,
    };
  }
}
