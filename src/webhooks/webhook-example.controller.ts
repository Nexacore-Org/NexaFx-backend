import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SkipApiKeyAuth } from '../api-keys/decorators/skip-api-key-auth.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RequireScopes } from '../api-keys/decorators/require-scopes.decorator';

/**
 * Example webhook controller demonstrating API key authentication
 * 
 * This endpoint can be called by external services using an API key
 * instead of user JWT authentication.
 */
@ApiTags('Webhooks - Example')
@SkipApiKeyAuth() // Skip JWT authentication
@UseGuards(ApiKeyGuard) // Enable API key validation
@RequireScopes('webhook:receive') // Require specific scope
@Controller('webhooks')
export class WebhookExampleController {
  @Post('payment-processor')
  @ApiOperation({ summary: 'Handle payment processor webhook' })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API key for authentication',
    required: true,
  })
  async handlePaymentWebhook(
    @Request() req: any,
    @Body() payload: any,
  ) {
    // Access API key metadata
    const apiKey = req.apiKey;
    console.log(`Webhook received from: ${apiKey.name}`);
    console.log(`API Key ID: ${apiKey.apiKeyId}`);
    console.log(`Scopes: ${apiKey.scopes.join(', ')}`);

    // Process the webhook payload
    // ... your business logic here

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }

  @Post('notification-service')
  @ApiOperation({ summary: 'Handle notification service webhook' })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API key for authentication',
    required: true,
  })
  @RequireScopes('webhook:receive', 'notifications:write')
  async handleNotificationWebhook(
    @Request() req: any,
    @Body() payload: any,
  ) {
    // This endpoint requires BOTH scopes
    const apiKey = req.apiKey;
    
    // Process notification
    return {
      success: true,
      message: 'Notification processed',
    };
  }
}
