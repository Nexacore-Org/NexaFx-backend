import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { Announcement } from './entities/announcement.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new announcement (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Announcement created successfully',
    type: Announcement,
  })
  create(
    @Body() createAnnouncementDto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.create(createAnnouncementDto);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all currently active announcements' })
  @ApiResponse({
    status: 200,
    description: 'Returns active announcements',
    type: [Announcement],
  })
  findActive(): Promise<Announcement[]> {
    return this.announcementsService.findActive();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an announcement (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement updated successfully',
    type: Announcement,
  })
  update(
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.update(id, updateAnnouncementDto);
  }
}
