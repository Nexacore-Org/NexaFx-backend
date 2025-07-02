import { IsEnum } from 'class-validator';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTransactionStatusDto {
  @ApiProperty({ example: 'COMPLETED', enum: TransactionStatus })
  @IsEnum(TransactionStatus)
  status: TransactionStatus;
}
