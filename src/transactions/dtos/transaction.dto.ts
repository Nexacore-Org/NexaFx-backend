import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

export class CreateDepositDto {
  @ApiProperty({
    example: 100.5,
    description: 'Amount to deposit',
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description: 'Stellar source address for the deposit',
  })
  @IsString()
  @IsNotEmpty()
  sourceAddress: string;
}

export class CreateWithdrawalDto {
  @ApiProperty({
    example: 50.25,
    description: 'Amount to withdraw',
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description:
      'Stellar destination address. Optional when beneficiaryId is provided — ' +
      'if both are given, beneficiaryId takes precedence.',
  })
  @IsString()
  @IsOptional()
  destinationAddress?: string;

  @ApiPropertyOptional({
    description:
      'ID of a saved beneficiary. If provided, the beneficiary\'s walletAddress ' +
      'is used as the destination and lastUsedAt is updated on success.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsOptional()
  beneficiaryId?: string;
}

export class VerifyTransactionDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the transaction to verify',
  })
  @IsUUID()
  @IsNotEmpty()
  transactionId: string;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'Filter by transaction type',
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    description: 'Filter by transaction status',
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    example: 'XLM',
    description: 'Filter by currency code',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items per page',
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class CreateSwapDto {
  @ApiProperty({
    example: 10,
    description: 'Amount of source currency to swap',
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Source currency code' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ example: 'USDC', description: 'Destination currency code' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description: 'Stellar source address for the swap',
  })
  @IsString()
  @IsNotEmpty()
  sourceAddress: string;
}