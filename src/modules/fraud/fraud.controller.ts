import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { FraudService } from './fraud.service';
import { FraudAlertQueryDto } from './dto/fraud-alert-query.dto';
import { UpdateFraudAlertDto } from './dto/update-fraud-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Admin - Fraud')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/fraud-alerts')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get()
  @ApiOperation({ summary: 'List fraud alerts with filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns list of fraud alerts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getFraudAlerts(@Query() query: FraudAlertQueryDto) {
    return this.fraudService.getFraudAlerts(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update fraud alert status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Fraud alert updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Fraud alert not found' })
  async updateFraudAlertStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFraudAlertDto,
  ) {
    const result = await this.fraudService.updateFraudAlertStatus(
      id,
      dto.status,
    );
    if (!result) {
      return { statusCode: 404, message: 'Fraud alert not found' };
    }
    return result;
  }
}
