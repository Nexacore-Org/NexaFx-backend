import { Controller, Post, Body } from '@nestjs/common';
import { DisputeEngineService } from './dispute-engine.service';
import { ProcessDisputeDto, OverrideDisputeDto } from './dto/dispute-engine.dto';

@Controller('disputes')
export class DisputeEngineController {
  constructor(private readonly disputeEngineService: DisputeEngineService) {}

  @Post('process')
  async processDispute(@Body() dto: ProcessDisputeDto) {
    return this.disputeEngineService.processDispute(dto);
  }

  @Post('override')
  overrideDecision(@Body() dto: OverrideDisputeDto) {
    return this.disputeEngineService.overrideDecision(dto);
  }
}
