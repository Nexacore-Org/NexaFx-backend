import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform metrics' })
  @ApiResponse({ status: 200, description: 'Returns platform statistics' })
  async getMetrics() {
    return this.adminService.getPlatformMetrics();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with filtering' })
  async getUsers(@Query() query: UserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get detailed user profile' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserRoleDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.updateUserRole(id, updateDto, admin.userId);
  }

  @Patch('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend user account' })
  async suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.suspendUser(id, admin.userId);
  }

  @Patch('users/:id/unsuspend')
  @ApiOperation({ summary: 'Unsuspend user account' })
  async unsuspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminService.unsuspendUser(id, admin.userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Monitor transactions' })
  async getTransactions(@Query() query: AdminTransactionQueryDto) {
    return this.adminService.getTransactions(query);
  }
}
