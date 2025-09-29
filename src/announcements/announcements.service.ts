import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Announcement, AnnouncementType } from './entities/announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  async create(
    createAnnouncementDto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    const announcement = this.announcementRepository.create({
      title: createAnnouncementDto.title,
      message: createAnnouncementDto.message,
      type: createAnnouncementDto.type,
      startDate: new Date(createAnnouncementDto.startDate),
      endDate: new Date(createAnnouncementDto.endDate),
    });
    return this.announcementRepository.save(announcement);
  }

  async findActive(): Promise<Announcement[]> {
    const now = new Date();
    return this.announcementRepository.find({
      where: {
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async update(
    id: string,
    updateAnnouncementDto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    const announcement = await this.announcementRepository.findOne({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID "${id}" not found`);
    }

    // Update only the fields that are provided
    if (updateAnnouncementDto.title !== undefined) {
      announcement.title = updateAnnouncementDto.title;
    }
    if (updateAnnouncementDto.message !== undefined) {
      announcement.message = updateAnnouncementDto.message;
    }
    if (updateAnnouncementDto.type !== undefined) {
      announcement.type = updateAnnouncementDto.type;
    }
    if (updateAnnouncementDto.startDate !== undefined) {
      announcement.startDate = new Date(updateAnnouncementDto.startDate);
    }
    if (updateAnnouncementDto.endDate !== undefined) {
      announcement.endDate = new Date(updateAnnouncementDto.endDate);
    }

    return this.announcementRepository.save(announcement);
  }

  async findOne(id: string): Promise<Announcement> {
    const announcement = await this.announcementRepository.findOne({
      where: { id },
    });
    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }
    return announcement;
  }
}
