import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { RbacAdminService } from './rbac-admin.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('Admin - RBAC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/rbac')
export class RbacAdminController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Get all roles with inheritance chain' })
  @ApiResponse({
    status: 200,
    description: 'Returns full role list with inheritance chain',
  })
  async getAllRoles() {
    return this.rbacAdminService.getAllRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: 'Create a new role' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({
    status: 201,
    description: 'Role created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad Request or circular inheritance' })
  async createRole(
    @Body() createDto: CreateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.rbacAdminService.createRole(createDto, user.userId);
  }

  @Patch('roles/:id')
  @ApiOperation({ summary: 'Update a role' })
  @ApiParam({ name: 'id', type: String, description: 'Role UUID' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad Request or circular inheritance' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.rbacAdminService.updateRole(id, updateDto, user.userId);
  }

  @Delete('roles/:id')
  @ApiOperation({ summary: 'Delete a role (cascades to user assignments)' })
  @ApiParam({ name: 'id', type: String, description: 'Role UUID' })
  @ApiResponse({
    status: 200,
    description: 'Role deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async deleteRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.rbacAdminService.deleteRole(id, user.userId);
    return { message: 'Role deleted successfully' };
  }

  @Get('users/:id/permissions')
  @ApiOperation({ summary: 'Get fully resolved permission set for a user' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns fully resolved permission set',
    schema: {
      example: {
        permissions: ['users:read', 'users:write', 'transactions:approve'],
      },
    },
  })
  async getUserPermissions(@Param('id', ParseUUIDPipe) id: string) {
    const permissions = await this.rbacAdminService.getUserPermissions(id);
    return { permissions };
  }

  @Get('roles/:id/diff')
  @ApiOperation({
    summary: 'Preview permission change without applying',
    description: 'Shows what permissions would be added/removed if parent changes',
  })
  @ApiParam({ name: 'id', type: String, description: 'Role UUID' })
  @ApiQuery({
    name: 'newParentId',
    type: String,
    required: true,
    description: 'New parent role ID to preview',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns permission diff',
    schema: {
      example: {
        added: ['admin:write', 'users:delete'],
        removed: ['users:read'],
      },
    },
  })
  async previewRoleDiff(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('newParentId') newParentId: string | null,
  ) {
    return this.rbacAdminService.previewRoleDiff(id, newParentId);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get RBAC audit logs' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'roleId', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns RBAC audit logs',
  })
  async getAuditLogs(
    @Query('action') action?: string,
    @Query('roleId') roleId?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.rbacAdminService.getAuditLogs({
      action,
      roleId,
      actorId,
      page: page || 1,
      limit: limit || 20,
    });
  }
}
