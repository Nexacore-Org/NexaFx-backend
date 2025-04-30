import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ActivityType } from '../constants/activity-types.enum';

export class CreateActivityLogDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsNotEmpty()
  @IsEnum(ActivityType)
  action: ActivityType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}