import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { Response } from 'express';
import { join } from 'path';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  @Patch('users/:id/suspend')
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

  @Get('transactions')
  @ApiOperation({ summary: 'Monitor transactions (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns transactions list' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getTransactions(@Query() query: AdminTransactionQueryDto) {
    return this.adminService.getTransactions(query);
  }

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
}
