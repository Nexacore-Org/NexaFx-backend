import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { StatusService } from './status.service';
import { ComponentStatus } from './entities/status-component.entity';
import { IncidentStatus } from './entities/status-incident.entity';

@ApiTags('Status')
@Controller({ path: 'status', version: '2' })
export class StatusPublicController {
  constructor(private readonly statusService: StatusService) {}

  @Get('/')
  getPublicStatus() {
    return this.statusService.getPublicStatus();
  }

  @Get('/incidents')
  getIncidentHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.statusService.getIncidentHistory(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}

@ApiTags('Admin Status')
@ApiBearerAuth()
@Controller('admin/status')
export class StatusAdminController {
  constructor(private readonly statusService: StatusService) {}

  @Post('/incidents')
  @Roles(UserRole.ADMIN)
  createIncident(
    @Body()
    dto: {
      title: string;
      body: string;
      severity: string;
      affectedComponents?: string[];
      startedAt?: Date;
    },
  ) {
    return this.statusService.createIncident(dto);
  }

  @Patch('/incidents/:id')
  @Roles(UserRole.ADMIN)
  updateIncidentStatus(
    @Param('id') id: string,
    @Body('status') status: IncidentStatus,
  ) {
    return this.statusService.updateIncidentStatus(id, status);
  }

  @Post('/incidents/:id/resolve')
  @Roles(UserRole.ADMIN)
  resolveIncident(@Param('id') id: string) {
    return this.statusService.resolveIncident(id);
  }

  @Patch('/components/:slug')
  @Roles(UserRole.ADMIN)
  updateComponentStatus(
    @Param('slug') slug: string,
    @Body() body: { status: ComponentStatus; uptimePercent?: string },
  ) {
    return this.statusService.updateComponentStatus(slug, body.status, body.uptimePercent);
  }
}
