import { IsString, IsOptional, IsObject, IsIP } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateActivityLogDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  userId: string;

  @ApiProperty({ example: '192.168.1.1' })
  @IsIP()
  ipAddress: string;

  @ApiProperty({
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  @IsString()
  userAgent: string;

  @ApiPropertyOptional({ example: 'Desktop' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ example: 'Chrome' })
  @IsOptional()
  @IsString()
  browser?: string;

  @ApiPropertyOptional({ example: 'Windows' })
  @IsOptional()
  @IsString()
  operatingSystem?: string;

  @ApiPropertyOptional({ example: 'Lagos, Nigeria' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsOptional()
  @IsString()
  sessionToken?: string;

  @ApiPropertyOptional({ example: 'LOGIN' })
  @IsOptional()
  @IsString()
  activityType?: string;

  @ApiPropertyOptional({
    example: { loginMethod: '2FA', deviceFingerprint: 'abc123' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
