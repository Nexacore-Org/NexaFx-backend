import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVaultDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  currency: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @ApiProperty()
  @IsDateString()
  unlockAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoDepositAmount?: number;

  @ApiProperty({ required: false, enum: AutoDepositFrequency })
  @IsOptional()
  @IsEnum(AutoDepositFrequency)
  autoDepositFrequency?: AutoDepositFrequency;
}
