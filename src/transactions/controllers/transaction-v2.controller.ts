import { Controller, Post, Get, Body, Request, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { TransactionsService } from '../services/transaction.service';
import {
  TransactionConfidenceService,
  UserCompletionStats,
} from '../services/transaction-confidence.service';
import { CreateDepositDto } from '../dtos/transaction.dto';
import { TransactionResponseDto } from '../dtos/transaction-response.dto';

@ApiTags('Transactions-v2')
@ApiBearerAuth('access-token')
@Controller({ path: 'transactions', version: '2' })
export class TransactionV2Controller {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly confidenceService: TransactionConfidenceService,
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
    const transaction = await this.transactionsService.createDeposit(
      req.user.userId,
      createDepositDto,
    );

    try {
      const confidence = await this.confidenceService.score(transaction);
      await this.transactionsService.updateConfidenceScore(transaction.id, {
        confidenceScore: confidence.score,
        expectedCompletionSeconds: confidence.expectedCompletionSeconds,
        confidenceLabel: confidence.label,
      });

      return {
        ...transaction,
        confidenceScore: confidence.score,
        expectedCompletionSeconds: confidence.expectedCompletionSeconds,
        expectedCompletionLabel: confidence.expectedCompletionLabel,
        confidenceLabel: confidence.label,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to compute confidence score for transaction ${transaction.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return transaction;
    }
  }

  @Get('completion-stats')
  @ApiOperation({
    summary: 'Get transaction completion statistics',
    description:
      'Returns average completion time for the authenticated user\'s ' +
      'SEND transactions in the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Completion statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        averageCompletionSeconds: { type: 'number', example: 8.5 },
        totalTransactions: { type: 'number', example: 42 },
        periodDays: { type: 'number', example: 30 },
      },
    },
  })
  async getCompletionStats(@Request() req): Promise<UserCompletionStats> {
    return this.confidenceService.getCompletionStats(req.user.userId);
  }

  private readonly logger = new Logger(TransactionV2Controller.name);
}
