import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RiskService, CustomerProfileInput } from './risk.service';
import { CustomerRiskRating } from './entities/customer-risk-rating.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Risk Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('customer/:userId')
  @ApiOperation({
    summary: 'Get customer risk rating (Admin/SuperAdmin only)',
    description: 'Retrieves current risk rating data for a specific customer. Access is restricted to administrators.',
  })
  @ApiResponse({ status: 200, description: 'Customer risk rating retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Risk rating not found for customer.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Rated users or regular users cannot view risk ratings.' })
  async getCustomerRisk(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<CustomerRiskRating> {
    const rating = await this.riskService.getRiskRating(userId);
    if (!rating) {
      throw new NotFoundException(`Risk rating not found for user ${userId}`);
    }
    return rating;
  }

  @Post('customer/:userId/evaluate')
  @ApiOperation({
    summary: 'Trigger risk rating evaluation for a customer (Admin/SuperAdmin only)',
    description: 'Calculates or recalculates customer risk score and applies downstream adjustments.',
  })
  @ApiResponse({ status: 200, description: 'Customer risk rating evaluated successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async evaluateCustomerRisk(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() profileInput?: CustomerProfileInput,
  ): Promise<CustomerRiskRating> {
    return this.riskService.evaluateCustomerRisk(userId, profileInput);
  }
}
