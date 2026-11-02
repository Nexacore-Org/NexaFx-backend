import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    @Optional()
    @InjectQueue('push-broadcast')
    private readonly broadcastQueue?: Queue,
  ) {}

  async createBroadcast(
    adminId: string,
    createBroadcastDto: CreateBroadcastDto,
  ): Promise<BroadcastResponseDto> {
    try {
      const broadcast = this.pushNotificationsRepository.create({
        title: createBroadcastDto.title,
        message: createBroadcastDto.message,
        sentBy: adminId,
        recipientCount: 0,
        status: PushNotificationStatus.ACTIVE,
      });

      const savedBroadcast =
        await this.pushNotificationsRepository.save(broadcast);

      if (
        this.broadcastQueue &&
        typeof this.broadcastQueue.add === 'function'
      ) {
        await this.broadcastQueue.add(
          'fanout',
          {
            broadcastId: savedBroadcast.id,
            adminId,
            title: createBroadcastDto.title,
            message: createBroadcastDto.message,
          },
          { jobId: `broadcast-${savedBroadcast.id}` },
        );
      }

      const recipientCount = await this.fanOutBroadcast(
        savedBroadcast.id,
        createBroadcastDto,
      );

      await this.pushNotificationsRepository.update(savedBroadcast.id, {
        recipientCount,
      });
      savedBroadcast.recipientCount = recipientCount;

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

  async fanOutBroadcast(
    broadcastId: string,
    createBroadcastDto: Pick<CreateBroadcastDto, 'title' | 'message'>,
  ): Promise<number> {
    let recipientCount = 0;
    let cursor: string | null = null;
    const hasKeysetFn =
      typeof this.usersService.findActiveUsersForBroadcast === 'function';
    const hasLegacyFn =
      typeof (this.usersService as any).findAllActive === 'function';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let batch: Array<{ id: string; fcmTokens?: string[] }> = [];

      if (hasKeysetFn) {
        batch = await this.usersService.findActiveUsersForBroadcast(
          cursor,
          BROADCAST_BATCH_SIZE,
        );
      } else if (hasLegacyFn && cursor === null) {
        batch = (await (this.usersService as any).findAllActive()) || [];
      }

      if (!batch || batch.length === 0) {
        break;
      }

      recipientCount += batch.length;

      const notificationDtos: CreateNotificationDto[] = batch.map((user) => ({
        userId: user.id,
        title: createBroadcastDto.title,
        message: createBroadcastDto.message,
        type: NotificationType.MESSAGING,
        metadata: {
          broadcastId,
          isBroadcast: true,
        },
      }));

      try {
        if (typeof this.notificationsService.createMany === 'function') {
          await this.notificationsService.createMany(notificationDtos);
        } else if (typeof this.notificationsService.create === 'function') {
          for (const dto of notificationDtos) {
            await this.notificationsService.create(dto);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to bulk create notifications for broadcast ${broadcastId}: ${message}`,
        );
      }

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

      if (!hasKeysetFn || batch.length < BROADCAST_BATCH_SIZE) {
        break;
      }

      cursor = batch[batch.length - 1].id;
    }

    return recipientCount;
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

      queryBuilder.orderBy('broadcast.createdAt', 'DESC');

      const total = await queryBuilder.getCount();
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

      await this.pushNotificationsRepository.update(id, {
        status: PushNotificationStatus.INACTIVE,
      });

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
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Broadcast IDs array cannot be empty');
    }

    const broadcasts = await this.pushNotificationsRepository.find({
      where: { id: In(ids) },
    });

    if (!broadcasts || broadcasts.length === 0) {
      throw new NotFoundException('No broadcasts found for the provided IDs');
    }

    if (broadcasts.length !== ids.length) {
      throw new BadRequestException('One or more broadcast IDs were not found');
    }

    await this.pushNotificationsRepository.update(
      { id: In(ids) },
      { status: PushNotificationStatus.INACTIVE },
    );

    await this.auditLogsService.createLog({
      userId: adminId,
      action: 'BULK_DEACTIVATE_BROADCASTS',
      entity: AuditEntityType.SYSTEM,
      entityId: ids[0],
      metadata: {
        ids,
        deactivatedCount: broadcasts.length,
      },
    });

    this.logger.log(
      `Bulk deactivated ${broadcasts.length} broadcasts by admin ${adminId}`,
    );

    return { deactivated: broadcasts.length };
  }

  async getActiveCount(): Promise<number> {
    return this.pushNotificationsRepository.count({
      where: { status: PushNotificationStatus.ACTIVE },
    });
  }
}
