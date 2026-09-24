import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import {
  ContentModerationService,
  ModerationResult,
} from '../content-moderation.service';
import { ModerationAction } from '../entities/content-moderation-event.entity';

@ApiTags('Admin-Moderation')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/moderation')
export class ModerationController {
  constructor(
    private readonly moderationService: ContentModerationService,
  ) {}

  @Post('moderate')
  @ApiOperation({
    summary: 'Moderate text content (Admin testing)',
    description:
      'Tests the moderation pipeline against provided text. Returns flags and action taken.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'Hello world' },
        context: { type: 'string', example: 'memo' },
      },
      required: ['text', 'context'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Moderation result',
    schema: {
      type: 'object',
      properties: {
        allowed: { type: 'boolean' },
        flags: { type: 'array', items: { type: 'string' } },
        cleaned: { type: 'string' },
        action: { type: 'string' },
      },
    },
  })
  async moderateText(
    @Body() body: { text: string; context: string },
  ): Promise<ModerationResult> {
    return this.moderationService.moderate(
      body.text,
      body.context,
      'admin-test',
    );
  }

  @Get('blocklist')
  @ApiOperation({
    summary: 'List profanity blocklist',
    description: 'Returns all words currently in the moderation blocklist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Blocklist words',
    schema: {
      type: 'array',
      items: { type: 'string' },
    },
  })
  async getBlocklist(): Promise<string[]> {
    return this.moderationService.getBlocklist();
  }

  @Post('blocklist')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add word to profanity blocklist',
    description:
      'Adds a word to the Redis-backed blocklist. No restart required.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        word: { type: 'string', example: 'badword' },
      },
      required: ['word'],
    },
  })
  @ApiResponse({ status: 201, description: 'Word added to blocklist' })
  async addToBlocklist(@Body() body: { word: string }): Promise<{
    message: string;
    word: string;
  }> {
    await this.moderationService.addToBlocklist(body.word);
    return { message: 'Word added to blocklist', word: body.word };
  }

  @Delete('blocklist/:word')
  @ApiOperation({
    summary: 'Remove word from profanity blocklist',
    description:
      'Removes a word from the Redis-backed blocklist. No restart required.',
  })
  @ApiParam({
    name: 'word',
    description: 'Word to remove from blocklist',
    example: 'badword',
  })
  @ApiResponse({ status: 200, description: 'Word removed from blocklist' })
  async removeFromBlocklist(
    @Param('word') word: string,
  ): Promise<{ message: string; word: string }> {
    await this.moderationService.removeFromBlocklist(word);
    return { message: 'Word removed from blocklist', word };
  }

  @Get('events')
  @ApiOperation({
    summary: 'List moderation events',
    description:
      'Returns content moderation events. Filter by action type. ' +
      'Default returns all non-ALLOWED events.',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: ModerationAction,
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Moderation events',
  })
  async getEvents(
    @Query('action') action?: ModerationAction,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.moderationService.getFlaggedEvents(
      action,
      page ?? 1,
      limit ?? 20,
    );
  }
}
