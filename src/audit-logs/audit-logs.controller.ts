import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  Post,
  Body,
  Res,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogsService } from './audit-logs.service';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto';
import { ScheduleAuditLogDeliveryDto } from './dto/schedule-audit-log-delivery.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { TransformResponseInterceptor } from '../common';

@ApiTags('audit-logs')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TransformResponseInterceptor)
@ApiBearerAuth()
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get non-user-specific audit logs (Super Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated audit logs',
    type: [AuditLogResponseDto],
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    enum: ['USER', 'TRANSACTION', 'WALLET', 'SYSTEM', 'AUTH'],
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditLogsService.getPrivilegedLogs(filters);
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
    const userId = req.user.userId;
    return this.auditLogsService.getLogsByUserId(userId, filters);
  }

  @Post('export')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Export audit logs (PDF/CSV)',
    description: 'Small exports return immediately; large exports return jobId for polling',
  })
  @ApiResponse({
    status: 200,
    description: 'Export initiated or completed',
  })
  async exportLogs(
    @CurrentUser() user: any,
    @Body() dto: ExportAuditLogsDto,
    @Res() res: Response,
  ) {
    const result = await this.auditLogsService.exportAuditLogs(user.userId, dto, dto.format);

    if (!result.isAsync && result.data) {
      // Stream small export directly
      res.setHeader('Content-Type', dto.format === 'PDF' ? 'application/pdf' : 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-export.${dto.format.toLowerCase()}"`);
      res.send(result.data);
    } else {
      // Return job ID for polling
      res.json({ jobId: result.jobId, isAsync: true });
    }
  }

  @Get('jobs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Poll export job status' })
  @ApiResponse({
    status: 200,
    description: 'Export job status',
  })
  async getJobStatus(
    @CurrentUser() user: any,
    @Param('id') jobId: string,
  ) {
    return this.auditLogsService.getExportJobStatus(user.userId, jobId);
  }

  @Get('jobs/:id/download')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Download completed export' })
  async downloadJob(
    @CurrentUser() user: any,
    @Param('id') jobId: string,
    @Res() res: Response,
  ) {
    const result = await this.auditLogsService.downloadExportJob(user.userId, jobId);
    const isJson = result.filename.endsWith('.csv');
    res.setHeader('Content-Type', isJson ? 'text/csv' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('schedule')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Schedule monthly audit log delivery' })
  @ApiResponse({
    status: 201,
    description: 'Monthly delivery scheduled',
  })
  async scheduleDelivery(
    @CurrentUser() user: any,
    @Body() dto: ScheduleAuditLogDeliveryDto,
  ) {
    return this.auditLogsService.scheduleMonthlyDelivery(user.userId, dto.email);
  }
}
