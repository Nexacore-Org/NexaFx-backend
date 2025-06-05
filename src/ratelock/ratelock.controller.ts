import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { RateLocksService } from './rate-locks.service';
import { RateLock } from './entities/ratelock.entity';

@Controller('rate-locks')
export class RateLocksController {
  constructor(private readonly rateLocksService: RateLocksService) {}

  @Post()
  async createRateLock(
    @Body() body: { userId: string; pair: string; lockedRate: number },
  ): Promise<RateLock> {
    const { userId, pair, lockedRate } = body;

    if (!userId || !pair || !lockedRate) {
      throw new BadRequestException('Missing required fields');
    }

    return this.rateLocksService.createRateLock(userId, pair, lockedRate);
  }

  @Get('active')
  async getActiveRateLock(
    @Query('userId') userId: string,
    @Query('pair') pair: string,
  ): Promise<RateLock | null> {
    if (!userId || !pair) {
      throw new BadRequestException('Missing query parameters');
    }

    return this.rateLocksService.getActiveRateLock(userId, pair);
  }

  @Post('validate')
  async validateRateLock(
    @Body()
    body: {
      userId: string;
      pair: string;
      lockedRate: number;
    },
  ): Promise<{ valid: boolean }> {
    const { userId, pair, lockedRate } = body;

    if (!userId || !pair || lockedRate === undefined) {
      throw new BadRequestException('Missing required fields');
    }

    const valid = await this.rateLocksService.validateRateLock(
      userId,
      pair,
      lockedRate,
    );
    return { valid };
  }

  @Get('expired/:id')
  async isExpired(@Param('id') id: string): Promise<{ expired: boolean }> {
    const expired = await this.rateLocksService.isExpired(id);
    return { expired };
  }
}
