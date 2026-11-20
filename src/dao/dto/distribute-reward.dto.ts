import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class DistributeRewardDto {
  @ApiProperty({ description: 'UUID of the user receiving the reward' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Unique request ID used to prevent duplicate rewards',
  })
  @IsUUID()
  requestId: string;

  @ApiProperty({
    description: 'Positive reward amount with up to 7 decimal places',
  })
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'Amount cannot exceed 7 decimal places.' },
  )
  @IsPositive({ message: 'Amount must be a positive number.' })
  amount: number;

  @ApiProperty({
    description: 'Reward currency',
    example: 'XLM',
    enum: ['XLM', 'USDC'],
  })
  @IsIn(['XLM', 'USDC'], { message: 'Unsupported reward currency.' })
  currency: string;
}
