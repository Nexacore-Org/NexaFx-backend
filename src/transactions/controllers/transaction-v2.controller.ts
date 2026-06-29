import { Controller, Post, Body, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { TransactionsService } from '../services/transaction.service';
import { CreateDepositDto } from '../dtos/transaction.dto';
import { TransactionResponseDto } from '../dtos/transaction-response.dto';

@ApiTags('Transactions-v2')
@ApiBearerAuth('access-token')
@Controller({ path: 'transactions', version: '2' })
export class TransactionV2Controller {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required idempotency key (max 128 chars, alphanumeric/hyphens/underscores)',
    example: 'txn_1234567890abcdef',
  })
  @ApiOperation({
    summary: 'Create a transaction (v2 - requires Idempotency-Key)',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key header is required',
  })
  @ApiResponse({ status: 400, description: 'Invalid Idempotency-Key format' })
  async createTransaction(
    @Request() req,
    @Body() createDepositDto: CreateDepositDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createDeposit(
      req.user.userId,
      createDepositDto,
    );
  }
}
