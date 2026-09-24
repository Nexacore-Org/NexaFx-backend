import { IsEnum, IsOptional, IsUUID, IsDateString, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AdminAuditLogsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false, enum: ['SUCCESS', 'FAILURE'] })
  @IsOptional()
  @IsEnum(['SUCCESS', 'FAILURE'])
  status?: 'SUCCESS' | 'FAILURE';

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
