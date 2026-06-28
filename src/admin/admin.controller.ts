import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Audit } from '../common/decorators/audit.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { KycService } from '../kyc/kyc.service';
import { KycStatus } from '../kyc/entities/kyc.entity';
import { RejectKycDto } from '../kyc/dtos/kyc-reject';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DataRequestType } from '../users/entities/data-request.entity';
import { UserRole } from '../users/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserPlanDto } from './dto/update-user-plan.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { OverrideTransactionDto } from './dto/override-transaction.dto';
import {
  PatchTransactionLimitDto,
  UpsertTransactionLimitDto,
} from './dto/transaction-limit.dto';
import { Response } from 'express';
import { join } from 'path';
import { AdminAuditLogsQueryDto } from './dto/admin-audit-logs-query.dto';
import { AdminAuditLogsExportQueryDto } from './dto/admin-audit-logs-export-query.dto';
import { UserKycTier } from '../users/user.entity';
import { RedisService } from '../common/services/redis.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly kycService: KycService,
    private readonly redisService: RedisService,
  ) { }

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns platform statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getMetrics(@Query() query: MetricsQueryDto) {
    return this.adminService.getPlatformMetrics(query);
  }

  @Get('metrics/export')
  @ApiOperation({ summary: 'Export platform metrics as CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async exportMetrics(@Query() query: MetricsQueryDto, @Res() res: Response) {
    const csv = await this.adminService.exportMetrics(query);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=metrics.csv',
    });
    res.send(csv);
  }

  // The following user endpoints have been moved to UsersAdminController in the Users module:
  //
  // @Get('users')
  // @ApiOperation({ summary: 'List users with filtering (Admin only)' })
  // @ApiResponse({ status: 200, description: 'Returns list of users' })
  // @ApiResponse({ status: 400, description: 'Bad Request' })
  // @ApiResponse({ status: 401, description: 'Unauthorized' })
  // @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  // async getUsers(@Query() query: UserQueryDto) {
  //   return this.adminService.getUsers(query);
  // }
  //
  // @Get('users/:id')
  // @ApiOperation({ summary: 'Get detailed user profile (Admin only)' })
  // @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  // @ApiResponse({ status: 200, description: 'Returns detailed user profile' })
  // @ApiResponse({ status: 400, description: 'Bad Request' })
  // @ApiResponse({ status: 401, description: 'Unauthorized' })
  // @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  // @ApiResponse({ status: 404, description: 'User not found' })
  // async getUserById(@Param('id', ParseUUIDPipe) id: string) {
  //   return this.adminService.getUserById(id);
  // }
  //
  // @Patch('users/:id/role')
  // @ApiOperation({ summary: 'Update user role (Admin only)' })
  // @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  // @ApiBody({ type: UpdateUserRoleDto })
  // @ApiResponse({ status: 200, description: 'User role updated successfully' })
  // @ApiResponse({ status: 400, description: 'Bad Request' })
  // @ApiResponse({ status: 401, description: 'Unauthorized' })
  // @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  // @ApiResponse({ status: 404, description: 'User not found' })
  // async updateUserRole(
  //   @Param('id', ParseUUIDPipe) id: string,
  //   @Body() updateDto: UpdateUserRoleDto,
  //   @CurrentUser() admin: { userId: string },
  // ) {
  //   return this.adminService.updateUserRole(id, updateDto, admin.userId);
  // }
  @Get('users')
  @ApiOperation({ summary: 'List users with filtering (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns list of users' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getUsers(@Query() query: UserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get detailed user profile (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Returns detailed user profile' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  @Audit('admin.role_change')
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserRoleDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.updateUserRole(id, updateDto, admin.userId);
  }

  @Patch('users/:id/plan')
  @ApiOperation({ summary: 'Update user plan (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: UpdateUserPlanDto })
  @ApiResponse({ status: 200, description: 'User plan updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserPlanDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.updateUserPlan(id, updateDto, admin.userId);
  }

  @Patch('users/:id/suspend')
  @Audit('admin.user_deactivation')
  @ApiOperation({ summary: 'Suspend user account (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User suspended successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.suspendUser(id, admin.userId);
  }

  @Patch('users/:id/unsuspend')
  @ApiOperation({ summary: 'Unsuspend user account (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User unsuspended successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unsuspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.unsuspendUser(id, admin.userId);
  }

  @Get('users/:id/data-requests')
  @ApiOperation({ summary: 'Get all data requests for a user (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns data requests for the user',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserRequests(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: DataRequestType,
  ) {
    return this.adminService.getUserRequests(id, type);
  }

  @Patch('users/:id/data-requests/:requestId/process')
  @ApiOperation({ summary: 'Process a data export request (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiParam({ name: 'requestId', type: String, description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async processDataRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.adminService.processDataRequest(id, requestId);
  }

  @Patch('users/:id/data-requests/:requestId/cancel')
  @ApiOperation({ summary: 'Cancel a data request (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiParam({ name: 'requestId', type: String, description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async cancelDataRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.adminService.cancelDataRequest(id, requestId);
  }

  @Get('data-requests')
  @ApiOperation({ summary: 'List all data requests (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns all data requests' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getAllRequests(
    @Query('type') type?: DataRequestType,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllRequests(type, status);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Monitor transactions (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns transactions list' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getTransactions(@Query() query: AdminTransactionQueryDto) {
    return this.adminService.getTransactions(query);
  }

  @Patch('transactions/:id/override')
  @ApiOperation({
    summary: 'Override transaction status (Admin only)',
    description:
      'Allows admin to override transaction status to SUCCESS, FAILED, or CANCELLED. Requires a reason for audit compliance.',
  })
  @ApiParam({
    name: 'id',
    description: 'Transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: OverrideTransactionDto })
  @ApiResponse({
    status: 200,
    description: 'Transaction status overridden successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status (PENDING not allowed) or missing/empty reason',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async overrideTransactionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() overrideDto: OverrideTransactionDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.overrideTransactionStatus(
      id,
      overrideDto,
      admin.userId,
    );
  }

  @Get('transaction-limits')
  @ApiOperation({ summary: 'List KYC tier transaction limits (Admin only)' })
  async listTransactionLimits() {
    return this.adminService.listTransactionLimits();
  }

  @Post('transaction-limits')
  @ApiOperation({ summary: 'Create or replace KYC tier transaction limit' })
  async upsertTransactionLimit(@Body() dto: UpsertTransactionLimitDto) {
    return this.adminService.upsertTransactionLimit(dto);
  }

  @Patch('transaction-limits/:tier')
  @ApiOperation({ summary: 'Update KYC tier transaction limit' })
  async patchTransactionLimit(
    @Param('tier') tier: UserKycTier,
    @Body() dto: PatchTransactionLimitDto,
  ) {
    return this.adminService.patchTransactionLimit(tier, dto);
  }

  // ── KYC File Serving (must be before kyc/:id to avoid route conflict) ──

  @Get('kyc-file/:userId/:version/:filename')
  @ApiOperation({ summary: 'Serve KYC uploaded file (Admin only)' })
  @ApiParam({ name: 'userId', type: String })
  @ApiParam({ name: 'version', type: String })
  @ApiParam({ name: 'filename', type: String })
  @ApiResponse({ status: 200, description: 'Returns the requested file' })
  @ApiResponse({ status: 404, description: 'File not found' })
  serveKycFile(
    @Param('userId') userId: string,
    @Param('version') version: string,
    @Param('filename') filename: string,
    @Res() res,
  ) {
    const filePath = join(
      process.cwd(),
      'uploads',
      'kyc',
      userId,
      version,
      filename,
    );
    interface FileSendError {
      message?: string;
      code?: string;
      status?: number;
    }

    interface TypedResponse {
      sendFile(filePath: string, cb?: (err?: FileSendError) => void): unknown;
      status(code: number): { send(body: unknown): unknown };
      send(body: unknown): unknown;
    }

    const typedRes = res as TypedResponse;

    return typedRes.sendFile(filePath, (err?: FileSendError) => {
      if (err) {
        typedRes.status(404).send({ message: 'File not found' });
      }
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform stats (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns platform statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getStats() {
    const cacheKey = 'admin_stats';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached;
    }
    const stats = await this.adminService.getStats();
    await this.redisService.set(cacheKey, stats, 300); // 5m TTL
    return stats;
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get audit logs (Admin only)' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  async getAuditLogs(@Query() query: AdminAuditLogsQueryDto) {
    return this.adminService.getAdminAuditLogs(query);
  }

  @Get('backups')
  @ApiOperation({ summary: 'List recent backup manifests (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns last 10 backup manifests' })
  async getBackups() {
    return this.adminService.getRecentBackups();
  }

  @Get('audit-logs/export')
  @ApiOperation({ summary: 'Export audit logs to CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Streaming CSV export started' })
  async exportAuditLogs(
    @Query() query: AdminAuditLogsExportQueryDto,
    @Res() res: Response,
  ) {
    if (query.format !== 'csv') {
      throw new BadRequestException('Unsupported format. Only csv is supported.');
    }
    return this.adminService.streamAuditLogsCsv(res, query);
  }
}
