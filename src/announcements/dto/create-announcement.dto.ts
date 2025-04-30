import { IsString, IsEnum, IsDateString, IsNotEmpty, Length, Validate } from 'class-validator';
import { AnnouncementType } from '../entities/announcement.entity';
import { IsDateAfter } from '../validators/is-date-after.validator';

export class CreateAnnouncementDto {
  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  title: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsEnum(AnnouncementType)
  type: AnnouncementType;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  @Validate(IsDateAfter, ['startDate'])
  endDate: string;
}