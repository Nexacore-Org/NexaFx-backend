import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WebhookService } from '../services/webhook.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async create(
    @Request() req,
    @Body() body: { url: string; events: string[] },
  ) {
    return this.webhookService.createEndpoint(
      req.user.id,
      body.url,
      body.events,
    );
  }

  @Get()
  async list(@Request() req) {
    const endpoints = await this.webhookService.listEndpoints(req.user.id);
    return endpoints.map(({ secret, ...rest }) => rest);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    await this.webhookService.deleteEndpoint(req.user.id, id);
    return { success: true };
  }

  @Get(':id/deliveries')
  async getDeliveries(@Request() req, @Param('id') id: string) {
    return this.webhookService.getDeliveryHistory(id, req.user.id);
  }

  @Post(':id/test')
  async testEndpoint(@Request() req, @Param('id') id: string) {
    await this.webhookService.testEndpoint(id, req.user.id);
    return { success: true };
  }

  @Post(':id/redeliver/:deliveryId')
  async redeliver(
    @Request() req,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    await this.webhookService.redeliver(id, deliveryId, req.user.id);
    return { success: true };
  }
}
