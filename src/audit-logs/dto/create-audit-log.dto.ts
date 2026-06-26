import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
  IsString,
  IsBoolean,
  IsIP,
  MaxLength,
} from 'class-validator';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

export class CreateAuditLogDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsEnum(AuditEntityType)
  entity?: AuditEntityType;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}
