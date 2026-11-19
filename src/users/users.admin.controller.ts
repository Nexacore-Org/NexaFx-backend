import {
  Controller,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
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
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

@ApiTags('Admin Users')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update user active status (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiResponse({
    status: 200,
    description: 'User active status updated successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserStatusDto,
  ): Promise<ProfileResponseDto> {
    const updatedUser = await this.usersService.updateUserStatus(
      id,
      updateDto.isActive,
    );
    return ProfileResponseDto.fromUser(updatedUser);
  }
}
