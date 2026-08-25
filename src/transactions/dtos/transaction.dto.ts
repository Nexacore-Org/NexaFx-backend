import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

/**
 * Payload for POST /transactions/deposit.
 *
 * **Frontend contract** (lib/api/transactions.ts):
 * All three fields below must be sent. `sourceAddress` is the user’s Stellar
 * public key — read it from `GET /users/profile` → `walletAddress`. Omitting
 * it will cause the backend to return a 400 with the message
 * "sourceAddress should not be empty".
 *
 * Example request body:
 * ```json
 * { "amount": 100.5, "currency": "XLM", "sourceAddress": "GDQP2K..." }
 * ```
 */
export class CreateDepositDto {
  @ApiProperty({ example: 100.5, description: 'Amount to deposit', minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM', description: 'Currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  /**
   * The user’s Stellar public key (G…).
   * **Required.** Obtain from `GET /users/profile` → `walletAddress`.
   * The backend uses this as the transaction source account on the Stellar
   * network; the request will be rejected with 400 if this field is absent.
   */
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description:
      'User’s Stellar public key (G…). Required. Read from GET /users/profile → walletAddress.',
  })
  @IsString()
  @IsNotEmpty()
  sourceAddress: string;

  @ApiPropertyOptional({ description: 'Optional wallet to credit (UUID). Defaults to primary wallet.', format: 'uuid' })
  @ApiPropertyOptional({
    description:
      'Optional wallet to credit. When omitted, the user’s default wallet is used.',
  })
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @ApiPropertyOptional({
    example: 'Payment for October rent',
    description: 'Shared memo visible to both parties (max 200 chars). Also written to Stellar memo field (truncated to 28 bytes if needed).',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

/**
 * Payload for POST /transactions/withdraw.
 *
 * **Frontend contract** (lib/api/transactions.ts):
 * You must provide EITHER `destinationAddress` OR `beneficiaryId`.
 * - `destinationAddress`: The recipient's Stellar public key (G...) or fiat destination.
 *   Use this for one-time withdrawals to an address not saved as a beneficiary.
 * - `beneficiaryId`: UUID of a saved beneficiary. The backend will use the
 *   beneficiary's `walletAddress` as the destination and update `lastUsedAt` on success.
 *
 * If both are provided, `beneficiaryId` takes precedence.
 * If neither is provided, the request will be rejected with a 400 error:
 * "Either destinationAddress or a valid beneficiaryId must be provided."
 *
 * Example request body (with destinationAddress):
 * ```json
 * { "amount": 50.25, "currency": "XLM", "destinationAddress": "GDQP2K..." }
 * ```
 *
 * Example request body (with beneficiaryId):
 * ```json
 * { "amount": 50.25, "currency": "XLM", "beneficiaryId": "a1b2c3d4-..." }
 * ```
 */
export class CreateWithdrawalDto {
  @ApiProperty({ example: 50.25, description: 'Amount to withdraw', minimum: 0.01 })
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
    description: 'Stellar destination address. Optional when beneficiaryId is provided — if both are given, beneficiaryId takes precedence.',
    description:
      "The recipient's Stellar public key (G...) or fiat destination address. " +
      'Optional when beneficiaryId is provided - if both are given, beneficiaryId takes precedence. ' +
      'At least one of destinationAddress or beneficiaryId must be provided.',
  })
  @IsString()
  @IsOptional()
  destinationAddress?: string;

  @ApiPropertyOptional({
    description: "ID of a saved beneficiary. If provided, the beneficiary's walletAddress is used as the destination and lastUsedAt is updated on success.",
    description:
      "ID of a saved beneficiary. If provided, the beneficiary's walletAddress " +
      'is used as the destination and lastUsedAt is updated on success. ' +
      'At least one of destinationAddress or beneficiaryId must be provided.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsOptional()
  beneficiaryId?: string;

  @ApiPropertyOptional({ description: 'Optional wallet to withdraw from (UUID). Defaults to primary wallet.', format: 'uuid' })
  @ApiPropertyOptional({
    description:
      'Optional wallet to withdraw from. When omitted, the user’s default wallet is used.',
  })
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @ApiPropertyOptional({
    example: 'Sending funds to Alice',
    description: 'Shared memo visible to both parties (max 200 chars). Also written to Stellar memo field (truncated to 28 bytes if needed).',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class VerifyTransactionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'UUID of the transaction to verify' })
  @IsUUID()
  @IsNotEmpty()
  transactionId: string;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({ enum: TransactionType, description: 'Filter by transaction type' })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus, description: 'Filter by transaction status' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ example: 'XLM', description: 'Filter by currency code' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'rent',
    description: 'Filter transactions that contain this tag (exact match, case-insensitive)',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({
    example: 'mum',
    description: 'Search across userNote, counterpartyMemo, and txHash (PostgreSQL ILIKE)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'Items per page', minimum: 1, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class CreateSwapDto {
  @ApiProperty({ example: 10, description: 'Amount of source currency to swap', minimum: 0.01 })
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

  @ApiPropertyOptional({ description: 'Optional wallet to use for the swap (UUID). sourceAddress must match the wallet public key.', format: 'uuid' })
  @ApiPropertyOptional({
    description:
      'Optional wallet to use for the swap. When omitted, the user’s default wallet is used. ' +
      'sourceAddress must match the selected wallet’s public key.',
  })
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @ApiPropertyOptional({
    example: 'Converting savings to USDC',
    description: 'Shared memo visible to both parties (max 200 chars). Also written to Stellar memo field (truncated to 28 bytes if needed).',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

/** PATCH /transactions/:id/note */
export class UpdateNoteDto {
  @ApiPropertyOptional({
    example: 'This was for mum birthday gift',
    description: 'Private note visible only to the owner. Pass null to clear.',
    nullable: true,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note: string | null;
}

/** PATCH /transactions/:id/tags */
export class UpdateTagsDto {
  @ApiProperty({
    example: ['rent', 'october', 'housing'],
    description: 'Replaces the full tag list. Max 10 tags, each max 30 chars.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags: string[];
}

/** Response item for GET /tags */
export class TagUsageDto {
  @ApiProperty({ example: 'rent' })
  tag: string;

  @ApiProperty({ example: 5, description: 'Number of transactions with this tag' })
  count: number;
}
