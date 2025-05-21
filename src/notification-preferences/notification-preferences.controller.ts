/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { NotificationPreferencesService } from './notification-preferences.service';
import { CreateNotificationPreferenceDto } from './dto/create-notification-preference.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationPreferenceDto } from './dto/notification-preference.dto';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';

@ApiTags('notification-preferences')
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create notification preferences' })
  @ApiResponse({
    status: 201,
    description: 'Successfully created notification preferences',
    type: NotificationPreferenceDto,
  })
  async create(
    @Body() createDto: CreateNotificationPreferenceDto,
    @Request() req,
  ): Promise<NotificationPreferenceDto> {
    // Admin operation for creating preferences for any user
    // For normal users, we use the /me endpoints
    try {
      // Check if user has admin permissions (implementation dependent on your auth system)
      if (!req.user.isAdmin) {
        throw new BadRequestException('Insufficient permissions');
      }

      return await this.preferencesService.create(createDto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved notification preferences',
    type: NotificationPreferenceDto,
  })
  async findMine(@Request() req): Promise<NotificationPreferenceDto> {
    return this.preferencesService.findByUserId(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user notification preferences' })
  @ApiResponse({
    status: 200,
    description: 'Successfully updated notification preferences',
    type: NotificationPreferenceDto,
  })
  async updateMine(
    @Body() updateDto: UpdateNotificationPreferenceDto,
    @Request() req,
  ): Promise<NotificationPreferenceDto> {
    return this.preferencesService.update(req.user.id, updateDto);
  }
}

