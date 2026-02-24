import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RateAlertsService } from './rate-alerts.service';
import { CreateRateAlertDto, RateAlertResponseDto } from './dto';

@ApiTags('Rate Alerts')
@ApiBearerAuth('access-token')
@Controller('rate-alerts')
export class RateAlertsController {
  constructor(private readonly rateAlertsService: RateAlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new exchange rate alert' })
  @ApiBody({ type: CreateRateAlertDto })
  @ApiResponse({
    status: 201,
    description: 'Rate alert created successfully',
    type: RateAlertResponseDto,
  })
  async createAlert(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateRateAlertDto,
  ): Promise<RateAlertResponseDto> {
    return this.rateAlertsService.createAlert(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts for authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Rate alerts retrieved successfully',
    type: [RateAlertResponseDto],
  })
  async getMyAlerts(
    @Request() req: { user: { userId: string } },
  ): Promise<RateAlertResponseDto[]> {
    return this.rateAlertsService.getUserAlerts(req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete one of my rate alerts' })
  @ApiResponse({
    status: 200,
    description: 'Rate alert deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async deleteAlert(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.rateAlertsService.deleteAlert(req.user.userId, id);
    return { success: true };
  }
}
