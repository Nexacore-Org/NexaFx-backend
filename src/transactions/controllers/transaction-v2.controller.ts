import { Controller, Post, Get, Body, Request, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { TransactionsService } from '../services/transaction.service';
import { FeeEstimatorService } from '../services/fee-estimator.service';
import {
  FeeEstimateResult,
  ConversionEstimateResult,
  BatchEstimateResult,
} from '../services/fee-estimator.service';
import {
  EstimateTransactionDto,
  EstimateConversionDto,
  BatchEstimateDto,
} from '../dtos/fee-estimate.dto';
import { CreateDepositDto } from '../dtos/transaction.dto';
import { TransactionResponseDto } from '../dtos/transaction-response.dto';

@ApiTags('Transactions-v2')
@ApiBearerAuth('access-token')
@Controller({ path: 'transactions', version: '2' })
export class TransactionV2Controller {
  private readonly logger = new Logger(TransactionV2Controller.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly feeEstimatorService: FeeEstimatorService,
  ) {}

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

  @Post('estimate')
  @ApiOperation({
    summary: 'Estimate transaction fees',
    description:
      'Returns a full fee breakdown for a transaction without executing it. ' +
      'Estimate is valid for 30 seconds.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fee estimate with full breakdown',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid estimation parameters',
  })
  async estimateTransaction(
    @Request() req,
    @Body() dto: EstimateTransactionDto,
  ): Promise<FeeEstimateResult> {
    return this.feeEstimatorService.estimateTransaction(req.user.userId, dto);
  }

  @Post('estimate/batch')
  @ApiOperation({
    summary: 'Batch estimate transaction fees',
    description:
      'Estimate fees for up to 20 transactions at once. Useful for payroll previews.',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch fee estimates with total fees',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid batch parameters or exceeds 20 transactions',
  })
  async estimateBatch(
    @Request() req,
    @Body() dto: BatchEstimateDto,
  ): Promise<BatchEstimateResult> {
    return this.feeEstimatorService.estimateBatch(
      req.user.userId,
      dto.transactions,
    );
  }
}
