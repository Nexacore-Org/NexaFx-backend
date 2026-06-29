import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('messages')
  @ApiOperation({ summary: 'List conversations (latest message preview per conversation)' })
  async getConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.messagingService.getConversations(user.userId);
  }

  @Get('messages/unread-count')
  @ApiOperation({ summary: 'Total unread message count' })
  async getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.messagingService.getUnreadCount(user.userId);
  }

  @Get('messages/:conversationId')
  @ApiOperation({ summary: 'Paginated message history for a conversation' })
  async getConversationHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.messagingService.getConversationHistory(
      conversationId,
      user.userId,
      pagination.page!,
      pagination.limit!,
    );
  }

  @Post('messages/:conversationId/read')
  @ApiOperation({ summary: 'Mark all messages in a conversation as read' })
  async markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.markConversationAsRead(conversationId, user.userId);
  }

  @Get('admin/messages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all user conversations with unread indicators (admin)' })
  async getAdminConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.messagingService.getAdminConversations(user.userId);
  }

  @Post('admin/messages/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send direct message to a user (admin)' })
  async sendDirectMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', ParseUUIDPipe) recipientId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagingService.sendDirectMessage(
      user.userId,
      recipientId,
      dto.body,
      dto.attachmentKeys,
    );
  }

  @Get('admin/messages/:userId/history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Conversation history with a specific user (admin)' })
  async getAdminUserHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.messagingService.getAdminUserHistory(
      user.userId,
      userId,
      pagination.page!,
      pagination.limit!,
    );
  }

  @Post('admin/broadcasts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create and send a broadcast announcement' })
  async createBroadcast(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.messagingService.createBroadcast(user.userId, dto);
  }

  @Get('admin/broadcasts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List broadcasts with recipient count and delivery status' })
  async listBroadcasts() {
    return this.messagingService.listBroadcasts();
  }
}
