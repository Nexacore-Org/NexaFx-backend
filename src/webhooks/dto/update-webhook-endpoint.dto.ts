import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_WEBHOOK_SCHEMA_VERSION,
  WEBHOOK_SCHEMA_VERSIONS,
  WebhookSchemaVersion,
} from '../../modules/webhooks/schemas';

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional({ example: 'https://example.com/hooks/nexafx' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: ['transaction.completed'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
