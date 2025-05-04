import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { CreateActivityLogDto } from './dto/create-log.dto';
import { ActivityType } from './constants/activity-types.enum';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private activityLogRepository: Repository<ActivityLog>,
  ) {}

  /**
   * Log a user activity
   * @param userId The ID of the user performing the action
   * @param action The type of action being performed
   * @param metadata Optional additional data related to the action
   * @returns The created activity log
   */
  async logActivity(
    userId: string,
    action: ActivityType,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    try {
      const activityLog = this.activityLogRepository.create({
        userId,
        action,
        metadata,
      });

      const savedLog = await this.activityLogRepository.save(activityLog);
      this.logger.debug(
        `Activity logged: ${action} for user ${userId}`,
      );
      return savedLog;
    } catch (error) {
      this.logger.error(
        `Failed to log activity: ${action} for user ${userId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all logs for a specific user
   * @param userId The ID of the user
   * @returns Array of activity logs
   */
  async findByUser(userId: string): Promise<ActivityLog[]> {
    return this.activityLogRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
    });
  }

  /**
   * Find logs by specific action type
   * @param action The action type to filter by
   * @returns Array of activity logs
   */
  async findByAction(action: ActivityType): Promise<ActivityLog[]> {
    return this.activityLogRepository.find({
      where: { action },
      order: { timestamp: 'DESC' },
    });
  }

  /**
   * Find logs with advanced filtering
   * @param filters Object containing filter criteria
   * @returns Array of activity logs
   */
  async findWithFilters(filters: {
    userId?: string;
    action?: ActivityType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ActivityLog[]> {
    const { userId, action, startDate, endDate } = filters;
    const queryBuilder = this.activityLogRepository.createQueryBuilder('log');

    if (userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId });
    }

    if (action) {
      queryBuilder.andWhere('log.action = :action', { action });
    }

    if (startDate) {
      queryBuilder.andWhere('log.timestamp >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('log.timestamp <= :endDate', { endDate });
    }

    queryBuilder.orderBy('log.timestamp', 'DESC');

    return queryBuilder.getMany();
  }
}