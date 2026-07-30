import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmReversalDto {
  @ApiProperty({ description: 'Documented reason for the reversal' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Court order or regulatory reference' })
  @IsOptional()
  @IsString()
  legalReference?: string;
}
