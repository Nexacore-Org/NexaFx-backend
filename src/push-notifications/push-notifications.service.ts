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
import { FirebaseService } from '../firebase/firebase.service';
import {
  CreateBroadcastDto,
  BroadcastResponseDto,
  PaginatedBroadcastResponse,
  BroadcastQueryDto,
} from './dto';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';

const BROADCAST_BATCH_SIZE = 500;
const FCM_MULTICAST_LIMIT = 500;

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger('PushNotificationsService');

  constructor(
    @InjectRepository(PushNotification)
    private readonly pushNotificationsRepository: Repository<PushNotification>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly firebaseService: FirebaseService,
  ) {}

  async createBroadcast(
    adminId: string,
    createBroadcastDto: CreateBroadcastDto,
  ): Promise<BroadcastResponseDto> {
    try {
      // Create the broadcast record first so notifications can reference it.
      const broadcast = this.pushNotificationsRepository.create({
        title: createBroadcastDto.title,
        message: createBroadcastDto.message,
        sentBy: adminId,
        recipientCount: 0,
        status: PushNotificationStatus.ACTIVE,
      });

      const savedBroadcast =
        await this.pushNotificationsRepository.save(broadcast);

      // Fan out in pages so we never load every user into memory at once.
      let recipientCount = 0;
      let offset = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await this.usersService.findActiveUsersForBroadcast(
          offset,
          BROADCAST_BATCH_SIZE,
        );

        if (batch.length === 0) {
          break;
        }

        recipientCount += batch.length;

        // Bulk insert notifications for this batch.
        const notificationDtos: CreateNotificationDto[] = batch.map(
          (user) => ({
            userId: user.id,
            title: createBroadcastDto.title,
            message: createBroadcastDto.message,
            type: NotificationType.MESSAGING,
            metadata: {
              broadcastId: savedBroadcast.id,
              isBroadcast: true,
            },
          }),
        );

        try {
          await this.notificationsService.createMany(notificationDtos);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to bulk create notifications for broadcast ${savedBroadcast.id}: ${message}`,
          );
        }

        // Send FCM in chunks of 500 tokens (sendEachForMulticast limit).
        const tokens = batch.flatMap((user) => user.fcmTokens || []);
        for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
          const chunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
          try {
            await this.firebaseService.sendToTokens(
              chunk,
              createBroadcastDto.title,
              createBroadcastDto.message,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`FCM Broadcast chunk failed: ${message}`);
          }
        }

        if (batch.length < BROADCAST_BATCH_SIZE) {
          break;
        }

        offset += BROADCAST_BATCH_SIZE;
      }

      // Persist the actual number of recipients reached.
      await this.pushNotificationsRepository.update(savedBroadcast.id, {
        recipientCount,
      });
      savedBroadcast.recipientCount = recipientCount;

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
      this.logger.error(`Failed to deactivate broadcast: ${errorMessage}`, error);
      throw new BadRequestException('Failed to deactivate broadcast');
    }
  }
}
