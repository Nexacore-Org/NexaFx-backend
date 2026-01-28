import { IsEnum, IsOptional, IsUUID, IsObject, IsString, IsBoolean, IsIP, MaxLength } from 'class-validator';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

export class CreateAuditLogDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  action: string;

  @IsEnum(AuditEntityType)
  entity: AuditEntityType;

  @IsOptional()
  @IsUUID()
  entityId?: string;

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
}