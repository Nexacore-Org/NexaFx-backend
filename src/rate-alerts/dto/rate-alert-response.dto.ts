import { ApiProperty } from '@nestjs/swagger';
import { RateAlertCondition } from '../entities/rate-alert.entity';

export class RateAlertResponseDto {
  @ApiProperty({ example: '9a7088bc-4fdd-4f1f-95f0-a939f2726f9e' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ example: 'USD' })
  fromCurrency: string;

  @ApiProperty({ example: 'NGN' })
  toCurrency: string;

  @ApiProperty({ example: '1600.00000000' })
  targetRate: string;

  @ApiProperty({ enum: RateAlertCondition, example: RateAlertCondition.ABOVE })
  condition: RateAlertCondition;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  recurring: boolean;

  @ApiProperty({ example: null, nullable: true })
  triggeredAt: Date | null;

  @ApiProperty({ example: '2026-02-23T12:00:00.000Z' })
  createdAt: Date;
}
