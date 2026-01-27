import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';

import { TransactionsService } from '../services/transaction.service';
import {
  CreateDepositDto,
  CreateWithdrawalDto,
  TransactionQueryDto,
} from '../dtos/transaction.dto';
import {
  TransactionResponseDto,
  TransactionListResponseDto,
} from '../dtos/transaction-response.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('deposit')
  async createDeposit(
    @Request() req,
    @Body() createDepositDto: CreateDepositDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createDeposit(
      req.user.id,
      createDepositDto,
    );
  }

  @Post('withdraw')
  async createWithdrawal(
    @Request() req,
    @Body() createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createWithdrawal(
      req.user.id,
      createWithdrawalDto,
    );
  }

  @Post(':id/verify')
  async verifyTransaction(
    @Param('id') id: string,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.verifyTransaction(id);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query() query: TransactionQueryDto,
  ): Promise<TransactionListResponseDto> {
    return this.transactionsService.findAllByUser(req.user.id, query);
  }

  @Get('pending')
  async getPendingTransactions(): Promise<TransactionResponseDto[]> {
    return this.transactionsService.getPendingTransactions();
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.findOne(id, req.user.id);
  }
}
