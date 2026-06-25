import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsDateString,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoDepositFrequency } from '../entities/savings-vault.entity';

export class CreateVaultDto {
  @ApiProperty({ example: 'Emergency Fund' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'USDC' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @ApiProperty({ example: '2027-06-25T00:00:00Z' })
  @IsDateString()
  unlockAt: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  autoDepositAmount?: number;

  @ApiPropertyOptional({ enum: AutoDepositFrequency })
  @IsOptional()
  @IsEnum(AutoDepositFrequency)
  autoDepositFrequency?: AutoDepositFrequency;
}
