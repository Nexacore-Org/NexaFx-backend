import {
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  Length,
  Validate,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementType } from '../entities/announcement.entity';
import { IsDateAfter } from '../validators/is-date-after.validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'System Maintenance' })
  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  title: string;

  @ApiProperty({
    example:
      'The system will be down for maintenance from 12:00 AM to 2:00 AM UTC.',
  })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiProperty({ enum: AnnouncementType, example: AnnouncementType.INFO })
  @IsEnum(AnnouncementType)
  type: AnnouncementType;

  @ApiProperty({ example: '2024-07-01T00:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-07-01T02:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  @Validate(IsDateAfter, ['startDate'])
  endDate: string;
}
