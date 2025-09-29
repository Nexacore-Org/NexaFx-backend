import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { TransactionType } from '../enums/transaction-type.enum';

export class QueryTransactionDto {
  @ApiPropertyOptional({
    required: false,
    enum: TransactionType,
    example: TransactionType.TRANSFER,
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    required: false,
    enum: TransactionStatus,
    example: TransactionStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    required: false,
    example: '321e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  currencyId?: string;
}
