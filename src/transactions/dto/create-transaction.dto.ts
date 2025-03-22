import { 
    IsUUID, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsDateString 
  } from 'class-validator';
import { TransactionType } from '../enum/transaction.enum';
import { TransactionStatus } from '../enum/transactionStatus.enum';
  
  export class CreateTransactionDto {
    @IsUUID()
    userId: string;
  
    @IsEnum(TransactionType)
    type: TransactionType;
  
    @IsNumber()
    @IsPositive()
    amount: number;
  
    @IsUUID()
    currencyId: string;
  
    @IsEnum(TransactionStatus)
    @IsOptional()
    status?: TransactionStatus = TransactionStatus.PENDING;
  
    @IsString()
    reference: string;
  
    @IsString()
    @IsOptional()
    description?: string;
  
    @IsOptional()
    metadata?: Record<string, any>;
  
    @IsString()
    @IsOptional()
    sourceAccount?: string;
  
    @IsString()
    @IsOptional()
    destinationAccount?: string;
  
    @IsNumber()
    @IsPositive()
    @IsOptional()
    feeAmount?: number;
  
    @IsUUID()
    @IsOptional()
    feeCurrencyId?: string;
  
    @IsDateString()
    @IsOptional()
    processingDate?: Date;
  
    @IsDateString()
    @IsOptional()
    completionDate?: Date;
  }
  