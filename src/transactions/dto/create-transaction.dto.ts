/* eslint-disable prettier/prettier */
import {
  IsUUID,
  IsEnum,
  IsPositive,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

export class CreateTransactionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  initiatorId: string;

  @ApiPropertyOptional({ example: '987e6543-e21b-12d3-a456-426614174000' })
  @IsUUID()
  @IsOptional()
  receiverId?: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.TRANSFER })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 100.5 })
  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @ApiProperty({ example: '321e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  currencyId: string;

  @ApiPropertyOptional({ enum: TransactionStatus, example: TransactionStatus.PENDING })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @ApiProperty({ example: 'TXN-2024-0001' })
  @IsString()
  reference: string;

  @ApiPropertyOptional({ example: 'Payment for invoice #123' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: { orderId: 'ORD-001', note: 'Urgent' } })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ example: 'ACC-001' })
  @IsString()
  @IsOptional()
  sourceAccount?: string;

  @ApiPropertyOptional({ example: 'ACC-002' })
  @IsString()
  @IsOptional()
  destinationAccount?: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 2 })
  feeAmount?: number;

  @ApiPropertyOptional({ example: '321e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsOptional()
  feeCurrencyId?: string;

  @ApiPropertyOptional({ example: '2024-07-01T10:00:00Z' })
  @IsOptional()
  processingDate?: Date;

  @ApiPropertyOptional({ example: '2024-07-01T12:00:00Z' })
  @IsOptional()
  completionDate?: Date;
}
