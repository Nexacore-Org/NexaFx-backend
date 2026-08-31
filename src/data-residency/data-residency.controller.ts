// src/data-residency/data-residency.controller.ts
import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { DataResidencyService } from './data-residency.service';
import { SetDataResidencyPolicyDto } from './dto/set-policy.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust based on your auth module path
import { RolesGuard } from '../auth/guards/roles.guard';       // Adjust based on your auth module path
import { Roles } from '../auth/decorators/roles.decorator';    // Adjust based on your auth module path

@Controller('v2/data-residency')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataResidencyController {
  constructor(private readonly dataResidencyService: DataResidencyService) {}

  @Post('policy')
  @Roles('ADMIN')
  async setPolicy(@Body() dto: SetDataResidencyPolicyDto, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.dataResidencyService.setPolicy(dto, adminId);
  }

  @Get('audit')
  @Roles('ADMIN')
  async getAuditConflicts() {
    return this.dataResidencyService.getAuditConflicts();
  }
}