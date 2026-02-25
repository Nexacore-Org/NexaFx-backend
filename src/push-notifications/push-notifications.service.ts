import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  Like,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import {
  PushNotification,
  PushNotificationStatus,
} from './entities/push-notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateBroadcastDto,
  BroadcastResponseDto,
  PaginatedBroadcastResponse,
  BroadcastQueryDto,
} from './dto';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger('PushNotificationsService');

  constructor(
    @InjectRepository(PushNotification)
    private readonly pushNotificationsRepository: Repository<PushNotification>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createBroadcast(
    adminId: string,
    createBroadcastDto: CreateBroadcastDto,
  ): Promise<BroadcastResponseDto> {
    try {
      // Get all active users (verified users)
      const activeUsers = await this.usersService.findAllActive();
      const recipientCount = activeUsers.length;

      // Create the broadcast record
      const broadcast = this.pushNotificationsRepository.create({
        title: createBroadcastDto.title,
        message: createBroadcastDto.message,
        sentBy: adminId,
        recipientCount,
        status: PushNotificationStatus.ACTIVE,
      });

      const savedBroadcast =
        await this.pushNotificationsRepository.save(broadcast);

      // Fan out individual notifications to all active users
      const notificationPromises = activeUsers.map((user) => {
        const notificationDto: CreateNotificationDto = {
          userId: user.id,
          title: createBroadcastDto.title,
          message: createBroadcastDto.message,
          type: NotificationType.SYSTEM,
          metadata: {
            broadcastId: savedBroadcast.id,
            isBroadcast: true,
          },
        };
        return this.notificationsService
          .create(notificationDto)
          .catch((err) => {
            this.logger.warn(
              `Failed to create notification for user ${user.id}: ${err.message}`,
            );
          });
      });

      await Promise.all(notificationPromises);

      // Log the action
      await this.auditLogsService.createLog({
        userId: adminId,
        action: 'CREATE_BROADCAST',
        entity: AuditEntityType.SYSTEM,
        entityId: savedBroadcast.id,
        metadata: {
          title: createBroadcastDto.title,
          recipientCount,
        },
      });

      this.logger.log(
        `Broadcast created and sent to ${recipientCount} users by admin ${adminId}`,
      );

      return BroadcastResponseDto.fromEntity(savedBroadcast);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create broadcast: ${errorMessage}`, error);
      throw new BadRequestException('Failed to create broadcast');
    }
  }

  async listBroadcasts(
    query: BroadcastQueryDto,
  ): Promise<PaginatedBroadcastResponse> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const skip = (page - 1) * limit;

      const queryBuilder =
        this.pushNotificationsRepository.createQueryBuilder('broadcast');

      // Apply filters
      if (query.status) {
        queryBuilder.andWhere('broadcast.status = :status', {
          status: query.status,
        });
      }

      if (query.search) {
        queryBuilder.andWhere(
          '(broadcast.title ILIKE :search OR broadcast.message ILIKE :search)',
          { search: `%${query.search}%` },
        );
      }

      if (query.startDate) {
        const startDate = new Date(query.startDate);
        queryBuilder.andWhere('broadcast.createdAt >= :startDate', {
          startDate,
        });
      }

      if (query.endDate) {
        const endDate = new Date(query.endDate);
        queryBuilder.andWhere('broadcast.createdAt <= :endDate', { endDate });
      }

      // Sort by created date descending
      queryBuilder.orderBy('broadcast.createdAt', 'DESC');

      // Get total count before pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      const broadcasts = await queryBuilder.skip(skip).take(limit).getMany();

      return {
        data: broadcasts.map((b) => BroadcastResponseDto.fromEntity(b)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list broadcasts: ${errorMessage}`, error);
      throw new BadRequestException('Failed to list broadcasts');
    }
  }

  async getBroadcastById(id: string): Promise<BroadcastResponseDto> {
    try {
      const broadcast = await this.pushNotificationsRepository.findOne({
        where: { id },
      });

      if (!broadcast) {
        throw new NotFoundException(`Broadcast with ID ${id} not found`);
      }

      return BroadcastResponseDto.fromEntity(broadcast);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get broadcast: ${errorMessage}`, error);
      throw new BadRequestException('Failed to get broadcast');
    }
  }

  async deactivateBroadcast(
    id: string,
    adminId: string,
  ): Promise<BroadcastResponseDto> {
    try {
      const broadcast = await this.pushNotificationsRepository.findOne({
        where: { id },
      });

      if (!broadcast) {
        throw new NotFoundException(`Broadcast with ID ${id} not found`);
      }

      if (broadcast.status === PushNotificationStatus.INACTIVE) {
        throw new BadRequestException('Broadcast is already inactive');
      }

      // Update status to INACTIVE
      await this.pushNotificationsRepository.update(id, {
        status: PushNotificationStatus.INACTIVE,
      });

      // Log the action
      await this.auditLogsService.createLog({
        userId: adminId,
        action: 'DEACTIVATE_BROADCAST',
        entity: AuditEntityType.SYSTEM,
        entityId: id,
        metadata: {
          status: PushNotificationStatus.INACTIVE,
        },
      });

      this.logger.log(`Broadcast ${id} deactivated by admin ${adminId}`);

      // Return updated broadcast
      const updated = await this.pushNotificationsRepository.findOne({
        where: { id },
      });
      return BroadcastResponseDto.fromEntity(updated!);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to deactivate broadcast: ${errorMessage}`,
        error,
      );
      throw new BadRequestException('Failed to deactivate broadcast');
    }
  }

  async bulkDeactivate(
    ids: string[],
    adminId: string,
  ): Promise<{ deactivated: number }> {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('At least one broadcast ID is required');
      }

      // Verify all broadcasts exist
      const broadcasts = await this.pushNotificationsRepository.find({
        where: { id: In(ids) },
      });

      if (broadcasts.length === 0) {
        throw new NotFoundException('No broadcasts found with provided IDs');
      }

      if (broadcasts.length !== ids.length) {
        throw new BadRequestException(
          `Only ${broadcasts.length} of ${ids.length} broadcasts were found`,
        );
      }

      // Update all to INACTIVE
      const result = await this.pushNotificationsRepository.update(
        { id: In(ids) },
        { status: PushNotificationStatus.INACTIVE },
      );

      const deactivated = result.affected || 0;

      // Log the action
      await this.auditLogsService.createLog({
        userId: adminId,
        action: 'BULK_DEACTIVATE_BROADCASTS',
        entity: AuditEntityType.SYSTEM,
        entityId: `${deactivated} broadcasts`,
        metadata: {
          broadcastIds: ids,
          deactivatedCount: deactivated,
        },
      });

      this.logger.log(
        `${deactivated} broadcasts deactivated in bulk by admin ${adminId}`,
      );

      return { deactivated };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to bulk deactivate broadcasts: ${errorMessage}`,
        error,
      );
      throw new BadRequestException('Failed to bulk deactivate broadcasts');
    }
  }

  async getActiveCount(): Promise<number> {
    return this.pushNotificationsRepository.count({
      where: { status: PushNotificationStatus.ACTIVE },
    });
  }
}
