import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { LimitsService } from './limits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Transaction Limits & Fees')
@Controller()
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Get('limits/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user transaction limits and remaining allowance' })
  @ApiResponse({ status: 200, description: 'User limits retrieved successfully' })
  async getMyLimits(@CurrentUser() user: { userId: string }) {
    return this.limitsService.getUserLimitStatus(user.userId);
  }

  @Get('admin/limits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all transaction limits (Admin only)' })
  async getAdminLimits() {
    return this.limitsService.getAllLimits();
  }

  @Patch('admin/limits/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transaction limit configuration (Admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction Limit UUID' })
  async updateAdminLimit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    return this.limitsService.updateLimit(id, body);
  }

  @Get('admin/fees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all fee configurations (Admin only)' })
  async getAdminFees() {
    return this.limitsService.getAllFees();
  }

  @Patch('admin/fees/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fee configuration (Admin only)' })
  @ApiParam({ name: 'id', description: 'Fee Config UUID' })
  async updateAdminFee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    return this.limitsService.updateFee(id, body);
  }
}
