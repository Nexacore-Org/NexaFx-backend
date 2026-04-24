import { IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../enum/notificationType.enum';
import { NotificationChannel } from '../enum/notificationChannel.enum';

class ChannelPreferenceDto {
  @ApiProperty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    example: {
      IN_APP: true,
      EMAIL: false,
      SMS: false,
      PUSH_NOTIFICATION: true,
    },
  })
  channels: Partial<Record<NotificationChannel, boolean>>;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [ChannelPreferenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelPreferenceDto)
  preferences: ChannelPreferenceDto[];
}
