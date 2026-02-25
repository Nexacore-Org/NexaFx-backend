import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBroadcastDto {
  @ApiProperty({
    description: 'Notification title/heading',
    example: 'New Feature Announcement',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Full notification message body',
    example: 'We have launched a new feature for your convenience.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
