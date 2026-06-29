import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Message, MessageType } from './entities/message.entity';
import { Broadcast, BroadcastStatus, BroadcastTargetAudience } from './entities/broadcast.entity';
import { User, UserKycTier, UserRole } from '../users/user.entity';
import { MessagingGateway } from '../gateways/messaging.gateway';

export class ConversationPreview {
  conversationId: string;
  otherUserId: string;
  otherUserName: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  lastSenderId: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Broadcast)
    private readonly broadcastRepo: Repository<Broadcast>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
    private readonly messagingGateway: MessagingGateway,
    private readonly configService: ConfigService,
  ) {}

  private makeConversationId(userA: string, userB: string): string {
    return [userA, userB].sort().join('_');
  }

  async getConversations(userId: string): Promise<ConversationPreview[]> {
    const messages = await this.messageRepo.find({
      where: [
        { senderId: userId },
        { recipientId: userId },
      ],
      order: { createdAt: 'DESC' },
      relations: ['sender', 'recipient'],
    });

    const conversationMap = new Map<string, {
      conversationId: string;
      lastMessage: Message;
      unreadCount: number;
      otherUser: User;
    }>();

    for (const msg of messages) {
      if (!conversationMap.has(msg.conversationId)) {
        const otherUser = msg.senderId === userId ? msg.recipient : msg.sender;
        if (!otherUser) continue;
        conversationMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          lastMessage: msg,
          unreadCount: msg.recipientId === userId && !msg.isRead ? 1 : 0,
          otherUser,
        });
      } else {
        const entry = conversationMap.get(msg.conversationId)!;
        if (msg.recipientId === userId && !msg.isRead) {
          entry.unreadCount++;
        }
      }
    }

    return Array.from(conversationMap.values())
      .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime())
      .map((entry) => ({
        conversationId: entry.conversationId,
        otherUserId: entry.otherUser.id,
        otherUserName: `${entry.otherUser.firstName ?? ''} ${entry.otherUser.lastName ?? ''}`.trim() || entry.otherUser.email,
        lastMessage: entry.lastMessage.body,
        lastMessageAt: entry.lastMessage.createdAt,
        unreadCount: entry.unreadCount,
        lastSenderId: entry.lastMessage.senderId,
      }));
  }

  async getConversationHistory(
    conversationId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    const [messages, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['sender'],
    });

    if (total > 0) {
      const isParticipant = messages.some(
        (m) => m.senderId === userId || m.recipientId === userId,
      );
      if (!isParticipant) {
        throw new ForbiddenException('You are not a participant in this conversation');
      }
    }

    const totalPages = Math.ceil(total / limit);
    return {
      data: messages.reverse(),
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async markConversationAsRead(conversationId: string, userId: string) {
    const result = await this.messageRepo.update(
      { conversationId, recipientId: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async getUnreadCount(userId: string) {
    const count = await this.messageRepo.count({
      where: { recipientId: userId, isRead: false, type: MessageType.DIRECT },
    });
    return { count };
  }

  async sendDirectMessage(
    senderId: string,
    recipientId: string,
    body: string,
    attachmentKeys?: string[],
  ) {
    const recipient = await this.userRepo.findOne({ where: { id: recipientId } });
    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    const conversationId = this.makeConversationId(senderId, recipientId);

    const message = this.messageRepo.create({
      conversationId,
      senderId,
      recipientId,
      body,
      attachmentKeys: attachmentKeys ?? [],
      type: MessageType.DIRECT,
    });
    const saved = await this.messageRepo.save(message);

    const full = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });

    this.messagingGateway.emitMessageNew(recipientId, full);

    if (!this.messagingGateway.isUserOnline(recipientId)) {
      await this.sendEmailNotification(recipient, senderId, body);
    }

    return full;
  }

  async getAdminConversations(adminId: string) {
    const messages = await this.messageRepo.find({
      where: [
        { senderId: adminId },
        { recipientId: adminId },
      ],
      order: { createdAt: 'DESC' },
      relations: ['sender', 'recipient'],
    });

    const conversationMap = new Map<string, {
      conversationId: string;
      lastMessage: Message;
      unreadCount: number;
      user: User;
    }>();

    for (const msg of messages) {
      const otherUser = msg.senderId === adminId ? msg.recipient : msg.sender;
      if (!otherUser) continue;

      if (!conversationMap.has(msg.conversationId)) {
        conversationMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          lastMessage: msg,
          unreadCount: msg.recipientId === adminId && !msg.isRead ? 1 : 0,
          user: otherUser,
        });
      } else {
        const entry = conversationMap.get(msg.conversationId)!;
        if (msg.recipientId === adminId && !msg.isRead) {
          entry.unreadCount++;
        }
      }
    }

    return Array.from(conversationMap.values())
      .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime())
      .map((entry) => ({
        conversationId: entry.conversationId,
        userId: entry.user.id,
        userName: `${entry.user.firstName ?? ''} ${entry.user.lastName ?? ''}`.trim() || entry.user.email,
        userEmail: entry.user.email,
        lastMessage: entry.lastMessage.body,
        lastMessageAt: entry.lastMessage.createdAt,
        unreadCount: entry.unreadCount,
        lastSenderId: entry.lastMessage.senderId,
      }));
  }

  async getAdminUserHistory(adminId: string, userId: string, page: number, limit: number) {
    const conversationId = this.makeConversationId(adminId, userId);

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['sender'],
    });

    const totalPages = Math.ceil(total / limit);
    return {
      data: messages.reverse(),
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async createBroadcast(
    adminId: string,
    dto: { subject: string; body: string; targetAudience: BroadcastTargetAudience; targetUserIds?: string[] },
  ) {
    const broadcast = this.broadcastRepo.create({
      adminId,
      subject: dto.subject,
      body: dto.body,
      targetAudience: dto.targetAudience,
      targetUserIds: dto.targetUserIds ?? [],
    });
    const saved = await this.broadcastRepo.save(broadcast);

    await this.broadcastQueue.add('fan-out', { broadcastId: saved.id });

    return saved;
  }

  async listBroadcasts() {
    return this.broadcastRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['admin'],
    });
  }

  async processBroadcastFanOut(broadcastId: string) {
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) {
      this.logger.error(`Broadcast ${broadcastId} not found for fan-out`);
      return;
    }

    let targetUserIds: string[] = [];

    switch (broadcast.targetAudience) {
      case BroadcastTargetAudience.ALL: {
        const users = await this.userRepo.find({ select: ['id'] });
        targetUserIds = users.map((u) => u.id);
        break;
      }
      case BroadcastTargetAudience.KYC_APPROVED: {
        const users = await this.userRepo.find({
          where: { kycTier: In([UserKycTier.BASIC, UserKycTier.ENHANCED, UserKycTier.FULL]) },
          select: ['id'],
        });
        targetUserIds = users.map((u) => u.id);
        break;
      }
      case BroadcastTargetAudience.UNVERIFIED: {
        const users = await this.userRepo.find({
          where: { kycTier: UserKycTier.UNVERIFIED },
          select: ['id'],
        });
        targetUserIds = users.map((u) => u.id);
        break;
      }
      case BroadcastTargetAudience.SPECIFIC_USERS: {
        targetUserIds = broadcast.targetUserIds ?? [];
        break;
      }
    }

    const admins = await this.userRepo.find({
      where: { role: In([UserRole.ADMIN, UserRole.SUPER_ADMIN]) },
      select: ['id'],
    });
    const adminIds = new Set(admins.map((a) => a.id));
    targetUserIds = targetUserIds.filter((id) => !adminIds.has(id));

    if (targetUserIds.length === 0) {
      this.logger.warn(`Broadcast ${broadcastId} has no target users`);
      broadcast.status = BroadcastStatus.SENT;
      broadcast.sentAt = new Date();
      broadcast.recipientCount = 0;
      await this.broadcastRepo.save(broadcast);
      return;
    }

    const messages = targetUserIds.map((recipientId) => ({
      conversationId: this.makeConversationId(broadcast.adminId, recipientId),
      senderId: broadcast.adminId,
      recipientId,
      body: broadcast.body,
      type: MessageType.BROADCAST,
      broadcastId: broadcast.id,
      attachmentKeys: [],
    }));

    await this.messageRepo.save(messages);

    broadcast.status = BroadcastStatus.SENT;
    broadcast.sentAt = new Date();
    broadcast.recipientCount = targetUserIds.length;
    await this.broadcastRepo.save(broadcast);

    for (const recipientId of targetUserIds) {
      const recipient = await this.userRepo.findOne({ where: { id: recipientId } });
      if (recipient) {
        this.messagingGateway.emitMessageNew(recipientId, { broadcastId: broadcast.id, body: broadcast.body, type: MessageType.BROADCAST });
        await this.sendEmailNotification(recipient, broadcast.adminId, `[${broadcast.subject}] ${broadcast.body}`);
      }
    }

    this.logger.log(`Broadcast ${broadcastId} sent to ${targetUserIds.length} users`);
  }

  private async sendEmailNotification(recipient: User, senderId: string, body: string) {
    try {
      const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
      const domain = this.configService.get<string>('MAILGUN_DOMAIN');
      const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
      const fromName = this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX';

      if (!apiKey || !domain || !fromEmail) {
        this.logger.warn('Mailgun not configured, skipping email notification');
        return;
      }

      const mailgun = new Mailgun(FormData);
      const client = mailgun.client({ username: 'api', key: apiKey });

      await client.messages.create(domain, {
        from: `${fromName} <${fromEmail}>`,
        to: [recipient.email],
        subject: 'New message from NexaFX',
        html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>New Message</h2>
          <p>You have received a new message from the NexaFX team:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            ${body}
          </div>
          <p style="color: #666; font-size: 12px;">Log in to NexaFX to reply.</p>
        </div>`,
        text: `New message from NexaFX:\n\n${body}\n\nLog in to reply.`,
      });
    } catch (error) {
      this.logger.error(`Failed to send email notification to ${recipient.email}`, error);
    }
  }
}
