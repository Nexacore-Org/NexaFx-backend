import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { UserRole } from './entities/user.entity';
import { UserService } from './providers/user.service';

@ApiTags('Admin - User Verification')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AUDITOR)
export class AdminUsersController {
  constructor(private readonly usersService: UserService) {}

  @Get('pending-verification')
  @ApiOperation({ summary: 'Get all users pending verification' })
  async getPendingVerifications(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.usersService.getPendingVerifications(page, limit);
  }

  @Get(':id/verification-details')
  @ApiOperation({ summary: 'Get detailed verification information for a user' })
  async getVerificationDetails(@Param('id') userId: string) {
    return this.usersService.getVerificationDetails(userId);
  }

  @Post(':id/approve-verification')
  @ApiOperation({ summary: 'Approve user verification' })
  async approveVerification(@Param('id') userId: string, @Body() body: { notes?: string }) {
    return this.usersService.approveVerification(userId, body?.notes);
  }

  @Post(':id/reject-verification')
  @ApiOperation({ summary: 'Reject user verification' })
  async rejectVerification(@Param('id') userId: string, @Body() body: { reason: string }) {
    return this.usersService.rejectVerification(userId, body?.reason);
  }
}


