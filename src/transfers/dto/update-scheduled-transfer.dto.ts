import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateScheduledTransferDto } from './create-scheduled-transfer.dto';
import { IsOptional, IsDateString, MinDate, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduledTransferStatus } from '../entities/scheduled-transfer.entity';

export class UpdateScheduledTransferDto extends PartialType(
  OmitType(CreateScheduledTransferDto, ['fromCurrencyId'] as const),
) {
  @ApiPropertyOptional({
    description: 'When to execute the transfer',
    example: '2025-06-15T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  @MinDate(new Date(), { message: 'Scheduled date must be in the future' })
  scheduledAt?: Date;

  @ApiPropertyOptional({
    description: 'Status of the scheduled transfer',
    enum: ScheduledTransferStatus,
    example: ScheduledTransferStatus.CANCELLED,
  })
  @IsOptional()
  @IsEnum(ScheduledTransferStatus, {
    message: `Status must be one of: ${Object.values(ScheduledTransferStatus).join(', ')}`,
  })
  status?: ScheduledTransferStatus;
}
