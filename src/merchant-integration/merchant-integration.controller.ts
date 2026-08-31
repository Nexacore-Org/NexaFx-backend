import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { MerchantIntegrationService } from './merchant-integration.service';
import { MerchantApiKeyGuard } from './guards/merchant-api-key.guard';

@Controller('v2/merchant-integration')
export class MerchantIntegrationController {
  constructor(private readonly integrationService: MerchantIntegrationService) {}

  @Post('checkout-sessions')
  @UseGuards(MerchantApiKeyGuard)
  public async createCheckoutSession(
    @Req() req: any,
    @Body('amount') amount: number,
    @Body('currency') currency: string,
    @Body('redirectUrl') redirectUrl?: string,
  ) {
    return this.integrationService.createCheckoutSession(req.merchantId, amount, currency, redirectUrl);
  }

  @Get('checkout-sessions/:id')
  public async getCheckoutSession(@Param('id') id: string) {
    return this.integrationService.getSessionStatus(id);
  }
}