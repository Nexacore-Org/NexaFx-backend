import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class DistributeRewardDto {
  @ApiProperty({ description: 'User UUID receiving the reward' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: 'Soroban contract ID (C...) to invoke; environment default can apply',
  })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiProperty({ description: 'Contract function name' })
  @IsString()
  @IsNotEmpty()
  functionName: string;

  @ApiPropertyOptional({ description: 'Arguments to pass to the contract function' })
  @IsOptional()
  args?: any[];

  @ApiProperty({ description: 'Reward amount', example: 100.5 })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Reward currency', example: 'XLM' })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
