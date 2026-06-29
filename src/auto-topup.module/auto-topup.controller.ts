import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AutoTopupService } from '../services/auto-topup.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoTopupRule } from '../entities/auto-topup-rule.entity';
import { AutoTopupEvent } from '../entities/auto-topup-event.entity';

@Controller('v2/auto-topup')
@UseGuards(JwtAuthGuard)
export class AutoTopupController {
  constructor(
    private readonly topupService: AutoTopupService,
    @InjectRepository(AutoTopupRule)
    private readonly ruleRepo: Repository<AutoTopupRule>,
    @InjectRepository(AutoTopupEvent)
    private readonly eventRepo: Repository<AutoTopupEvent>,
  ) {}

  @Post()
  async createRule(@Request() req, @Body() body: any) {
    return await this.topupService.createRule(req.user.id.toString(), body);
  }

  @Get()
  async listMyRules(@Request() req) {
    const rules = await this.ruleRepo.find({ where: { userId: req.user.id.toString() } });
    // Aggregates rules along with standard workspace profile outputs
    return { data: rules };
  }

  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleRuleActiveState(@Param('id') id: string, @Request() req) {
    const rule = await this.ruleRepo.findOne({ where: { id, userId: req.user.id.toString() } });
    if (!rule) throw new NotFoundException('Target automation rule not found.');
    
    rule.isActive = !rule.isActive;
    return await this.ruleRepo.save(rule);
  }

  @Get(':id/history')
  async getRuleHistory(@Param('id') id: string, @Request() req) {
    // Confirm rule ownership before serving historical audit logs
    const rule = await this.ruleRepo.findOne({ where: { id, userId: req.user.id.toString() } });
    if (!rule) throw new NotFoundException('Rule profile target mapping missing.');

    const history = await this.eventRepo.find({
      where: { ruleId: id },
      order: { createdAt: 'DESC' },
    });
    return { data: history };
  }

  @Delete(':id')
  async removeRule(@Param('id') id: string, @Request() req) {
    const result = await this.ruleRepo.delete({ id, userId: req.user.id.toString() });
    if (result.affected === 0) throw new NotFoundException('Target rule missing or unauthorized.');
    return { success: true };
  }
}