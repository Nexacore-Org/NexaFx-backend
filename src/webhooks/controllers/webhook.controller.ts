import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from '../services/webhook.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateWebhookEndpointDto } from '../dto/update-webhook-endpoint.dto';
import { WEBHOOK_SCHEMA_VERSION_REGISTRY } from '../../modules/webhooks/schemas';

@ApiTags('Webhooks')
// Served on both /v1 and /v2 so existing consumers keep working while schema
// version management is documented against /v2.
@Controller({ path: 'webhooks', version: ['1', '2'] })
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async create(
    @Request() req,
    @Body()
    body: { url: string; events: string[]; preferredSchemaVersion?: string },
  ) {
    return this.webhookService.createEndpoint(
      req.user.id,
      body.url,
      body.events,
      body.preferredSchemaVersion,
    );
  }

  @Get()
  async list(@Request() req) {
    const endpoints = await this.webhookService.listEndpoints(req.user.id);
    return endpoints.map(({ secret, ...rest }) => rest);
  }

  @Get('schema-versions')
  @ApiOperation({
    summary: 'List webhook payload schema versions and their sunset dates',
  })
  getSchemaVersions() {
    return Object.values(WEBHOOK_SCHEMA_VERSION_REGISTRY);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an endpoint, including its preferred payload schema version',
  })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() body: UpdateWebhookEndpointDto,
  ) {
    const { secret, ...rest } = await this.webhookService.updateEndpoint(
      req.user.id,
      id,
      body,
    );
    return rest;
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
