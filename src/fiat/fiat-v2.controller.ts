import { Controller, Post, Body, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import {
  IsNumber,
  IsPositive,
  Min,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionsService } from '../transactions/services/transaction.service';
import { TransactionResponseDto } from '../transactions/dtos/transaction-response.dto';

export class FiatDepositDto {
  @ApiProperty({
    example: 100.5,
    description: 'Amount to deposit',
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'USD', description: 'Currency code' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 'bank_transfer', description: 'Payment method' })
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiPropertyOptional({
    example: 'user-note-123',
    description: 'Optional reference',
  })
  @IsOptional()
  @IsString()
  reference?: string;
}

@ApiTags('Fiat-v2')
@ApiBearerAuth('access-token')
@Controller({ path: 'fiat', version: '2' })
export class FiatV2Controller {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('deposit')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required idempotency key (max 128 chars, alphanumeric/hyphens/underscores)',
    example: 'fiat_deposit_1234567890',
  })
  @ApiOperation({
    summary: 'Initiate fiat deposit (v2 - requires Idempotency-Key)',
  })
  @ApiResponse({
    status: 201,
    description: 'Fiat deposit transaction created successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key header is required',
  })
  @ApiResponse({ status: 400, description: 'Invalid Idempotency-Key format' })
  async createDeposit(
    @Request() req,
    @Body() fiatDepositDto: FiatDepositDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createDeposit(req.user.userId, {
      amount: fiatDepositDto.amount,
      currency: fiatDepositDto.currency,
      sourceAddress: req.user.walletPublicKey,
    });
  }
}
