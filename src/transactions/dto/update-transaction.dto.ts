import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTransactionDto } from './create-transaction.dto';

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {
  @ApiPropertyOptional({ example: 200.75 })
  amount?: number;

  @ApiPropertyOptional({ example: 'Payment for invoice #456 (updated)' })
  description?: string;

  @ApiPropertyOptional({ example: 'TXN-2024-0002' })
  reference?: string;

  @ApiPropertyOptional({
    example: { orderId: 'ORD-002', note: 'Updated note' },
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ example: 'ACC-003' })
  sourceAccount?: string;

  @ApiPropertyOptional({ example: 'ACC-004' })
  destinationAccount?: string;

  @ApiPropertyOptional({ example: 3.0 })
  feeAmount?: number;

  @ApiPropertyOptional({ example: '321e4567-e89b-12d3-a456-426614174000' })
  feeCurrencyId?: string;

  @ApiPropertyOptional({ example: '2024-07-02T10:00:00Z' })
  processingDate?: Date;

  @ApiPropertyOptional({ example: '2024-07-02T12:00:00Z' })
  completionDate?: Date;
}
