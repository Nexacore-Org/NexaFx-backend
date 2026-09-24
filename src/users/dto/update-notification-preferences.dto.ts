import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class NotificationTypesDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  TRANSACTION?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  KYC?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  RATE_ALERT?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @ApiProperty({ type: NotificationTypesDto, required: false })
  @ValidateNested()
  @Type(() => NotificationTypesDto)
  @IsOptional()
  types?: NotificationTypesDto;
}
