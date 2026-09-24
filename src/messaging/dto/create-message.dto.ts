import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ description: 'Message body text' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'S3/file attachment keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentKeys?: string[];
}
