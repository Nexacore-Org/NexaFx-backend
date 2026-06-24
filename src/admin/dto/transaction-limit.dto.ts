import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, Min, IsString, IsBoolean, IsOptional } from 'class-validator';
import { UserKycTier } from '../../users/user.entity';

export class UpsertTransactionLimitDto {
  @ApiProperty({ enum: UserKycTier, description: 'KYC tier' })
  @IsEnum(UserKycTier)
  tier: UserKycTier;

  @ApiProperty({ example: 'SEND', description: 'Transaction type' })
  @IsString()
  transactionType: string;

  @ApiProperty({ example: 'USD', description: 'Currency code' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 500, description: 'Single transaction max in USD' })
  @IsNumber()
  @Min(0)
  singleTransactionMax: number;

  @ApiProperty({ example: 5000, description: 'Daily limit in USD' })
  @IsNumber()
  @Min(0)
  dailyMax: number;

  @ApiProperty({ example: 50000, description: 'Monthly limit in USD' })
  @IsNumber()
  @Min(0)
  monthlyMax: number;

  @ApiPropertyOptional({ example: true, description: 'Is this limit active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTransactionLimitDto extends UpsertTransactionLimitDto {}

export class UpdateTransactionLimitDto {
  @ApiPropertyOptional({ example: 500, description: 'Single transaction max in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  singleTransactionMax?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Daily limit in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyMax?: number;

  @ApiPropertyOptional({ example: 50000, description: 'Monthly limit in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyMax?: number;

  @ApiPropertyOptional({ example: true, description: 'Is this limit active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PatchTransactionLimitDto {
  @ApiProperty({ example: 500, description: 'Single transaction max in USD' })
  @IsNumber()
  @Min(0)
  singleTransactionMax: number;

  @ApiProperty({ example: 5000, description: 'Daily limit in USD' })
  @IsNumber()
  @Min(0)
  dailyMax: number;

  @ApiProperty({ example: 50000, description: 'Monthly limit in USD' })
  @IsNumber()
  @Min(0)
  monthlyMax: number;

  @ApiPropertyOptional({ example: true, description: 'Is this limit active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TransactionLimitResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: UserKycTier })
  tier: UserKycTier;

  @ApiProperty()
  transactionType: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  singleTransactionMax: string;

  @ApiProperty()
  dailyMax: string;

  @ApiProperty()
  monthlyMax: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
