import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from '../services/webhook.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { CreateWebhookEndpointDto } from '../dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from '../dto/update-webhook-endpoint.dto';
import { WEBHOOK_SCHEMA_VERSION_REGISTRY } from '../../modules/webhooks/schemas';

@ApiTags('Webhooks')
// Served on both /v1 and /v2 so existing consumers keep working while schema
// version management is documented against /v2.
@Controller({ path: 'webhooks', version: ['1', '2'] })
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  private resolveUserId(
    user:
      | CurrentUserPayload
      | { id?: string; user?: { id?: string; userId?: string } },
  ): string {
    return (
      (user as CurrentUserPayload)?.userId ??
      (user as { id?: string })?.id ??
      (user as { user?: { userId?: string; id?: string } })?.user?.userId ??
      (user as { user?: { id?: string } })?.user?.id ??
      ''
    );
  }

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateWebhookEndpointDto,
  ) {
    return this.webhookService.createEndpoint(
      this.resolveUserId(user),
      body.url,
      body.events,
      body.preferredSchemaVersion,
    );
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const endpoints = await this.webhookService.listEndpoints(
      this.resolveUserId(user),
    );
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWebhookEndpointDto,
  ) {
    const { secret, ...rest } = await this.webhookService.updateEndpoint(
      this.resolveUserId(user),
      id,
      body,
    );
    return rest;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.webhookService.deleteEndpoint(this.resolveUserId(user), id);
    return { success: true };
  }

  @Post(':id/rotate-secret')
  @ApiOperation({
    summary:
      'Rotate the endpoint signing secret; the new secret is returned once',
  })
  async rotateSecret(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhookService.rotateSecret(this.resolveUserId(user), id);
  }

  @Get(':id/deliveries')
  async getDeliveries(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = this.resolveUserId(user);
    if (page !== undefined || limit !== undefined) {
      return this.webhookService.getDeliveryHistory(
        id,
        userId,
        page !== undefined ? Number(page) : undefined,
        limit !== undefined ? Number(limit) : undefined,
      );
    }
    return this.webhookService.getDeliveryHistory(id, userId);
  }

  @Post(':id/test')
  async testEndpoint(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.webhookService.testEndpoint(id, this.resolveUserId(user));
    return { success: true };
  }

  @Post(':id/redeliver/:deliveryId')
  async redeliver(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    await this.webhookService.redeliver(
      id,
      deliveryId,
      this.resolveUserId(user),
    );
    return { success: true };
  }
}
