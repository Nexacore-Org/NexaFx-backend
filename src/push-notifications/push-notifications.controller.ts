import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PushNotificationsService } from './push-notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { TransformResponseInterceptor } from '../common';
import {
  CreateBroadcastDto,
  BroadcastResponseDto,
  PaginatedBroadcastResponse,
  BroadcastQueryDto,
  BulkDeactivateDto,
} from './dto';

@ApiTags('admin-push-notifications')
@Controller('admin/push-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TransformResponseInterceptor)
@ApiBearerAuth()
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create and broadcast a push notification to all active users',
    description:
      'Creates a broadcast notification and fans out individual notifications to every active verified user on the platform',
  })
  @ApiBody({
    type: CreateBroadcastDto,
    description: 'Broadcast notification details',
  })
  @ApiResponse({
    status: 201,
    description: 'Broadcast created and sent successfully',
    type: BroadcastResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async createBroadcast(
    @Body() createBroadcastDto: CreateBroadcastDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<BroadcastResponseDto> {
    return this.pushNotificationsService.createBroadcast(
      user.userId,
      createBroadcastDto,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List all push notification broadcasts',
    description:
      'Retrieves a paginated list of all broadcasts with optional filtering by status, date range, and search term',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Filter by broadcast status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by title or message (case-insensitive)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter broadcasts created after this date (ISO format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter broadcasts created before this date (ISO format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of broadcasts',
    type: PaginatedBroadcastResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async listBroadcasts(
    @Query() query: BroadcastQueryDto,
  ): Promise<PaginatedBroadcastResponse> {
    return this.pushNotificationsService.listBroadcasts(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get a specific broadcast by ID',
    description:
      'Retrieves detailed information about a single broadcast notification',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Broadcast ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Broadcast details',
    type: BroadcastResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Broadcast not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async getBroadcast(@Param('id') id: string): Promise<BroadcastResponseDto> {
    return this.pushNotificationsService.getBroadcastById(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Deactivate a single broadcast',
    description:
      'Changes the status of a broadcast from ACTIVE to INACTIVE. This prevents it from being delivered again but preserves the record.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Broadcast ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Broadcast deactivated successfully',
    type: BroadcastResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Broadcast not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Broadcast is already inactive or invalid request',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async deactivateBroadcast(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<BroadcastResponseDto> {
    return this.pushNotificationsService.deactivateBroadcast(id, user.userId);
  }

  @Patch('bulk/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bulk deactivate multiple broadcasts',
    description:
      'Deactivates multiple broadcasts at once by providing an array of broadcast IDs',
  })
  @ApiBody({
    type: BulkDeactivateDto,
    description: 'Array of broadcast IDs to deactivate',
  })
  @ApiResponse({
    status: 200,
    description: 'Broadcasts deactivated successfully',
    schema: {
      example: { deactivated: 5 },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid broadcast IDs or empty array',
  })
  @ApiResponse({
    status: 404,
    description: 'One or more broadcasts not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async bulkDeactivate(
    @Body() bulkDeactivateDto: BulkDeactivateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ deactivated: number }> {
    return this.pushNotificationsService.bulkDeactivate(
      bulkDeactivateDto.ids,
      user.userId,
    );
  }
}
