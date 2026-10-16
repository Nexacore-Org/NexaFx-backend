import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from '../services/webhook.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/interfaces/current-user-payload.interface';
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
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: { url: string; events: string[]; preferredSchemaVersion?: string },
  ) {
    return this.webhookService.createEndpoint(
      user.userId,
      body.url,
      body.events,
      body.preferredSchemaVersion,
    );
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const endpoints = await this.webhookService.listEndpoints(user.userId);
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
    summary:
      'Update an endpoint, including its preferred payload schema version',
  })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdateWebhookEndpointDto,
  ) {
    const { secret, ...rest } = await this.webhookService.updateEndpoint(
      user.userId,
      id,
      body,
    );
    return rest;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.webhookService.deleteEndpoint(user.userId, id);
    return { success: true };
  }

  @Post(':id/rotate-secret')
  @ApiOperation({
    summary:
      'Rotate the endpoint signing secret; the new secret is returned once',
  })
  async rotateSecret(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.webhookService.rotateSecret(user.userId, id);
  }

  @Get(':id/deliveries')
  async getDeliveries(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.webhookService.getDeliveryHistory(id, user.userId);
  }

  @Post(':id/test')
  async testEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.webhookService.testEndpoint(id, user.userId);
    return { success: true };
  }

  @Post(':id/redeliver/:deliveryId')
  async redeliver(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    await this.webhookService.redeliver(id, deliveryId, user.userId);
    return { success: true };
  }
}
