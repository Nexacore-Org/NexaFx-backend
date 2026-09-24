import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  experimentKey: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  eventName: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}
