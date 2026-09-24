/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserRole } from './user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserQueryDto } from '../admin/dto/user-query.dto';
import { UpdateUserRoleDto } from '../admin/dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('Admin Users')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List users with pagination and filtering (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Returns paginated list of users' })
  async getUsers(@Query() query: UserQueryDto) {
    return this.usersService.findAdminUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get complete user profile (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns complete user profile without password fields',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const safeUser = { ...user } as any;
    delete safeUser.password;
    delete safeUser.passwordHash;
    delete safeUser.hashedPassword;
    return safeUser;
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserRoleDto,
  ) {
    const updatedUser = await this.usersService.updateUserRole(
      id,
      updateDto.role,
    );
    const safeUser = { ...updatedUser } as any;
    delete safeUser.password;
    delete safeUser.passwordHash;
    delete safeUser.hashedPassword;
    return safeUser;
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update user active status (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiResponse({
    status: 200,
    description: 'User active status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserStatusDto,
  ) {
    const updatedUser = await this.usersService.updateUserStatus(
      id,
      updateDto.isActive,
    );
    const safeUser = { ...updatedUser } as any;
    delete safeUser.password;
    delete safeUser.passwordHash;
    delete safeUser.hashedPassword;
    return safeUser;
  }
}
