import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OverrideScreeningDto {
  @ApiProperty({ description: 'Reason for overriding the screening result' })
  @IsString()
  @MinLength(10)
  reason: string;
}
