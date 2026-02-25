import { IsOptional, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PushNotificationStatus } from '../entities/push-notification.entity';

export class BroadcastQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: PushNotificationStatus,
    example: PushNotificationStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(PushNotificationStatus)
  status?: PushNotificationStatus;

  @ApiPropertyOptional({
    description: 'Search by title or message',
    example: 'Feature',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering (ISO format)',
    example: '2025-02-01T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering (ISO format)',
    example: '2025-02-28T23:59:59Z',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
