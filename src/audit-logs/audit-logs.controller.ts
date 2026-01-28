import { Controller, Get, Query, UseGuards, UseInterceptors, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'src/users/user.entity'; 
import { TransformResponseInterceptor } from '../common'; 



@ApiTags('audit-logs')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TransformResponseInterceptor)
@ApiBearerAuth()
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get audit logs (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated audit logs',
    type: [AuditLogResponseDto],
  })
  @ApiQuery({ name: 'entity', required: false, enum: ['USER', 'TRANSACTION', 'WALLET', 'SYSTEM', 'AUTH'] })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditLogsService.getLogs(filters);
  }

  @Get('my-logs')
  @ApiOperation({ summary: 'Get current user audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Returns current user audit logs',
    type: [AuditLogResponseDto],
  })
  async getMyLogs(
    @Query() filters: Omit<GetAuditLogsDto, 'userId'>,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.auditLogsService.getLogsByUserId(userId, filters);
  }
}