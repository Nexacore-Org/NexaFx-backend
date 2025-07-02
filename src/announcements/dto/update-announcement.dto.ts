import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {
  @ApiPropertyOptional({ example: 'System Maintenance (Updated)' })
  title?: string;

  @ApiPropertyOptional({ example: 'The maintenance window has been extended to 3:00 AM UTC.' })
  message?: string;

  @ApiPropertyOptional({ example: '2024-07-01T01:00:00Z' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-07-01T03:00:00Z' })
  endDate?: string;
}