import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetAuditLogsDto } from '../audit-logs/dto/get-audit-logs.dto';
import { UserRole } from '../users/user.entity';
import { CreateManagedAdminDto } from './dto/create-managed-admin.dto';
import { UpdateManagedAdminRoleDto } from './dto/update-managed-admin-role.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('Super Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('admins')
  @ApiOperation({
    summary:
      'Create a managed admin account. Defaults to ADMIN unless role is explicitly set to SUPER_ADMIN.',
  })
  @ApiResponse({ status: 201, description: 'Managed admin created successfully' })
  createAdmin(
    @CurrentUser() actor: CurrentUserPayload,
    @Body() dto: CreateManagedAdminDto,
  ) {
    return this.superAdminService.createAdmin(actor.userId, dto);
  }

  @Patch('admins/:id/role')
  @ApiOperation({
    summary: 'Assign or revoke elevated admin roles for an existing user',
  })
  @ApiResponse({ status: 200, description: 'Managed admin role updated successfully' })
  updateManagedAdminRole(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManagedAdminRoleDto,
  ) {
    return this.superAdminService.updateManagedAdminRole(actor.userId, id, dto);
  }

  @Delete('admins/:id')
  @ApiOperation({
    summary: 'Demote an ADMIN or SUPER_ADMIN account back to USER',
  })
  @ApiResponse({ status: 200, description: 'Managed admin demoted successfully' })
  demoteAdmin(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.superAdminService.demoteAdmin(actor.userId, id);
  }

  @Get('audit-logs')
  @ApiOperation({
    summary: 'Get all audit logs across all users, including sensitive entries',
  })
  @ApiResponse({ status: 200, description: 'Returns paginated audit logs' })
  getAuditLogs(
    @CurrentUser() actor: CurrentUserPayload,
    @Query() filters: GetAuditLogsDto,
  ) {
    return this.superAdminService.getAuditLogs(actor.userId, filters);
  }

  @Patch('platform/config')
  @ApiOperation({
    summary:
      'Update maintenance mode, supported currencies, and fee configuration in one privileged endpoint',
  })
  @ApiResponse({ status: 200, description: 'Platform configuration updated successfully' })
  updatePlatformConfig(
    @CurrentUser() actor: CurrentUserPayload,
    @Body() dto: UpdatePlatformConfigDto,
  ) {
    return this.superAdminService.updatePlatformConfig(actor.userId, dto);
  }
}
