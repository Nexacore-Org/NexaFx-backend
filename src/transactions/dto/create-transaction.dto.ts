import {
    IsUUID,
    IsEnum,
    IsPositive,
    IsOptional,
    IsString,
    IsNumber,
  } from 'class-validator';
  import { TransactionType } from '../enums/transaction-type.enum';
  import { TransactionStatus } from '../enums/transaction-status.enum';
  
  export class CreateTransactionDto {
    @IsUUID()
    userId: string;
  
    @IsEnum(TransactionType)
    type: TransactionType;
  
    @IsPositive()
    @IsNumber({ maxDecimalPlaces: 2 })
    amount: number;
  
    @IsUUID()
    currencyId: string;
  
    @IsOptional()
    @IsEnum(TransactionStatus)
    status?: TransactionStatus;
  
    @IsString()
    reference: string;
  
    @IsOptional()
    @IsString()
    description?: string;
  
    @IsOptional()
    metadata?: Record<string, any>;
  
    @IsOptional()
    @IsString()
    sourceAccount?: string;
  
    @IsOptional()
    @IsString()
    destinationAccount?: string;
  
    @IsOptional()
    @IsPositive()
    @IsNumber({ maxDecimalPlaces: 2 })
    feeAmount?: number;
  
    @IsOptional()
    @IsUUID()
    feeCurrencyId?: string;
  
    @IsOptional()
    processingDate?: Date;
  
    @IsOptional()
    completionDate?: Date;
  }
  