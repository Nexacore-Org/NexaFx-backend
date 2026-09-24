import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { SavingsRecommendationsService } from './savings-recommendations.service';

@ApiTags('Savings Recommendations')
@ApiBearerAuth()
@Controller({ path: 'savings-recommendations', version: '2' })
export class SavingsRecommendationsController {
  constructor(private readonly recommendationsService: SavingsRecommendationsService) {}

  @Get('/')
  getRecommendations(@Req() req: Request) {
    const userId = (req.user as any).id;
    return this.recommendationsService.getRecommendations(userId);
  }

  @Post('/:id/act')
  markActedOn(@Param('id') id: string, @Req() req: Request) {
    const userId = (req.user as any).id;
    return this.recommendationsService.markActedOn(id, userId);
  }
}
