import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BroadcastTargetAudience } from '../entities/broadcast.entity';

export class CreateBroadcastDto {
  @ApiProperty({ description: 'Broadcast subject' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Broadcast body text' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ enum: BroadcastTargetAudience, description: 'Target audience segment' })
  @IsEnum(BroadcastTargetAudience)
  targetAudience: BroadcastTargetAudience;

  @ApiPropertyOptional({ description: 'User IDs for SPECIFIC_USERS audience' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetUserIds?: string[];
}
