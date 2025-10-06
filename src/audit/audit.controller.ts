import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { UserRole } from 'src/user/entities/user.entity';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NoneGuard } from 'src/common/guards/none.guard';

@ApiTags('audit')
@Controller('audit')
@UseGuards(RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Public summary endpoint
  @Get('public-summary')
  @UseGuards(NoneGuard)
  @ApiOkResponse({ description: 'Public audit summary' })
  getPublicSummary() {}

  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth()
  @Get('logs')
  @Roles(UserRole.ADMIN)
  @Roles(UserRole.ADMIN) //Only admins can access /audit/logs.
  async getAuditLogs() {
    return this.auditService.findAll();
  }
}
