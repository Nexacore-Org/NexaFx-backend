import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { AutoDepositFrequency } from '../entities/savings-vault.entity';

export class CreateVaultDto {
  @ApiProperty({ example: 'My Emergency Fund' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MaxLength(10)
  currency: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  unlockAt: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoDepositAmount?: number;

  @ApiPropertyOptional({ enum: AutoDepositFrequency, example: 'MONTHLY' })
  @IsOptional()
  @IsEnum(AutoDepositFrequency)
  autoDepositFrequency?: AutoDepositFrequency;
}
