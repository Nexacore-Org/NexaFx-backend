import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RebalancingService } from './rebalancing.service';
import { CreateOrUpdatePolicyDto } from './dto/rebalancing-policy.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('v2/portfolio/rebalancing')
@UseGuards(JwtAuthGuard)
export class RebalancingController {
  constructor(private readonly rebalancingService: RebalancingService) {}

  @Get()
  async getPolicy(@Req() req: any) {
    return this.rebalancingService.getPolicy(req.user.id);
  }

  @Put()
  async upsertPolicy(@Req() req: any, @Body() dto: CreateOrUpdatePolicyDto) {
    return this.rebalancingService.upsertPolicy(req.user.id, dto);
  }

  @Delete()
  async deactivatePolicy(@Req() req: any) {
    return this.rebalancingService.deactivatePolicy(req.user.id);
  }

  @Get('preview')
  async preview(@Req() req: any) {
    return this.rebalancingService.calculateTrades(req.user.id);
  }

  @Post('execute')
  async execute(@Req() req: any) {
    return this.rebalancingService.execute(req.user.id);
  }
}