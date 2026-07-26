import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RiskService } from './risk.service';
import { RiskRating } from './entities/customer-risk-rating.entity';

@ApiTags('Risk Matrix')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all risk ratings' })
  async listRatings() {
    return this.riskService.getUserRating('');
  }

  @Get('users/high-risk')
  @ApiOperation({ summary: 'Get high risk users' })
  async getHighRiskUsers() {
    return this.riskService.getHighRiskUsers();
  }

  @Post('users/:userId/assess')
  @ApiOperation({ summary: 'Trigger risk assessment for a user' })
  async triggerAssessment(@Param('userId') userId: string) {
    return this.riskService.assessUser(userId);
  }

  @Post('users/:userId/override')
  @ApiOperation({ summary: 'Manually override user risk rating' })
  async overrideRating(
    @Param('userId') userId: string,
    @Body() body: { rating: RiskRating; reason: string },
  ) {
    return this.riskService.overrideRating(userId, body.rating, body.reason);
  }
}
