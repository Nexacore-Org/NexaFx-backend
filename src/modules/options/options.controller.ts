import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OptionsService } from './options.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Options')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'options', version: '2' })
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Post('quote')
  async getQuote(
    @Body()
    body: {
      strikePrice: string;
      expiryDate: string;
      contractSize: string;
    },
  ) {
    return this.optionsService.getPremium(body);
  }

  @Post()
  async create(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      strikePrice: string;
      expiryDate: string;
      contractSize: string;
    },
  ) {
    return this.optionsService.createContract(req.user.id, body);
  }

  @Get()
  async list(@Req() req: { user: { id: string } }) {
    return this.optionsService.contractRepo.find({
      where: { userId: req.user.id },
      order: { createdAt: 'DESC' },
    });
  }

  @Get('pnl')
  async pnl(@Req() req: { user: { id: string } }) {
    return this.optionsService.getPnL(req.user.id);
  }
}
