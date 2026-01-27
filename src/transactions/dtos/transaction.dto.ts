import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TransactionType } from '../entities/transaction.entity';

export class CreateDepositDto {
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  sourceAddress: string;
}

export class CreateWithdrawalDto {
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  destinationAddress: string;
}

export class VerifyTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  transactionId: string;
}

export class TransactionQueryDto {
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type?: TransactionType;

  @IsString()
  currency?: string;
}
