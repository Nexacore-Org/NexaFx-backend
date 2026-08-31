import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  AnnouncementResponseDto,
} from './announcements.service';

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller('v2/announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new announcement (ADMIN only)' })
  @ApiResponse({
    status: 201,
    description: 'Announcement created successfully',
  })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<AnnouncementResponseDto> {
    return this.announcementsService.create(dto, user.userId);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get active announcements for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Active announcements retrieved successfully',
  })
  async findActive(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AnnouncementResponseDto[]> {
    return this.announcementsService.findActiveForUser(
      user.userId,
      user.role,
    );
  }

  @Post(':id/acknowledge')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Acknowledge an announcement' })
  @ApiResponse({
    status: 200,
    description: 'Announcement acknowledged successfully',
  })
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: boolean }> {
    return this.announcementsService.acknowledge(id, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all announcements (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'All announcements retrieved successfully',
  })
  async findAll(): Promise<AnnouncementResponseDto[]> {
    return this.announcementsService.findAll();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an announcement (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement updated successfully',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateAnnouncementDto>,
  ): Promise<AnnouncementResponseDto> {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Deactivate an announcement (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement deactivated successfully',
  })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean }> {
    return this.announcementsService.deactivate(id);
  }
}
