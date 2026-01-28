import { ApiProperty } from '@nestjs/swagger';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false })
  userId?: string;

  @ApiProperty()
  action: string;

  @ApiProperty({ enum: AuditEntityType })
  entity: AuditEntityType;

  @ApiProperty({ required: false })
  entityId?: string;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;

  @ApiProperty({ required: false })
  ipAddress?: string;

  @ApiProperty({ required: false })
  userAgent?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isSensitive: boolean;
}