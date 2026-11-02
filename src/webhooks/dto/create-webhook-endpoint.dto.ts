import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_WEBHOOK_SCHEMA_VERSION,
  WEBHOOK_SCHEMA_VERSIONS,
  WebhookSchemaTransformer,
  WebhookSchemaVersion,
} from '../../modules/webhooks/schemas';

export const ALLOWED_WEBHOOK_EVENTS = [
  '*',
  ...WebhookSchemaTransformer.registeredEvents(),
] as const;

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://example.com/hooks/nexafx' })
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'Webhook URL must be a valid HTTPS URL' },
  )
  url: string;

  @ApiProperty({
    example: ['transaction.completed'],
    enum: ALLOWED_WEBHOOK_EVENTS,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn([...ALLOWED_WEBHOOK_EVENTS], { each: true })
  events: string[];

  @ApiPropertyOptional({
    description:
      'Payload schema version to pin this endpoint to. 1.0 is deprecated — see docs/webhook-schema-versions.md.',
    enum: WEBHOOK_SCHEMA_VERSIONS,
    default: DEFAULT_WEBHOOK_SCHEMA_VERSION,
  })
  @IsOptional()
  @IsIn([...WEBHOOK_SCHEMA_VERSIONS])
  preferredSchemaVersion?: WebhookSchemaVersion;
}
