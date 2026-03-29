import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../../transactions/entities/transaction.entity';

export class OverrideTransactionDto {
  @ApiProperty({
    description: 'New status to set for the transaction',
    enum: TransactionStatus,
    enumName: 'TransactionStatus',
    example: TransactionStatus.SUCCESS,
  })
  @IsNotEmpty()
  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @ApiProperty({
    description: 'Reason for overriding the transaction status',
    example: 'Stuck transaction due to blockchain congestion',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;
}
