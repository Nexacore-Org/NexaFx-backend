import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ErasureDto {
  @ApiProperty({
    example: 'my_secure_password',
    description: 'Current password to verify identity before erasure',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    example: 'No longer using the service',
    description: 'Optional reason for deleting the account',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
