import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { SimulateConversionDto, ConversionSimulationResponse } from '../currencies/dto/simulate-conversion.dto';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorators';
import { UserRole } from '../user/entities/user.entity';
import { AuditInterceptor } from '../audit/audit.interceptor';

@Controller('conversions')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  @Post('simulate')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async simulateConversion(
    @Body() simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    return this.conversionsService.simulateConversion(simulateConversionDto);
  }
} 