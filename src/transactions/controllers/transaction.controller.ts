import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

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
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/user.entity';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('deposit')
  @ApiOperation({ summary: 'Initiate a deposit transaction' })
  @ApiBody({ type: CreateDepositDto })
  @ApiResponse({
    status: 201,
    description: 'Deposit transaction created successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body or unsupported currency',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 500, description: 'Blockchain transaction failed' })
  async createDeposit(
    @Request() req,
    @Body() createDepositDto: CreateDepositDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createDeposit(
      req.user.userId,
      createDepositDto,
    );
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Initiate a withdrawal transaction' })
  @ApiBody({ type: CreateWithdrawalDto })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal transaction created successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid request body, unsupported currency, or insufficient balance',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 500, description: 'Blockchain transaction failed' })
  async createWithdrawal(
    @Request() req,
    @Body() createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.createWithdrawal(
      req.user.userId,
      createWithdrawalDto,
    );
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Manually verify a pending transaction' })
  @ApiParam({
    name: 'id',
    description: 'Transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction verified successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Transaction has no blockchain hash',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 500, description: 'Blockchain verification failed' })
  async verifyTransaction(
    @Param('id') id: string,
    @Request() req,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.verifyTransaction(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all transactions for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user transactions',
    type: TransactionListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async findAll(
    @Request() req,
    @Query() query: TransactionQueryDto,
  ): Promise<TransactionListResponseDto> {
    return this.transactionsService.findAllByUser(req.user.userId, query);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all pending transactions (admin)' })
  @ApiResponse({
    status: 200,
    description: 'List of all pending transactions',
    type: [TransactionResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getPendingTransactions(): Promise<TransactionResponseDto[]> {
    return this.transactionsService.getPendingTransactions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction by ID' })
  @ApiParam({
    name: 'id',
    description: 'Transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction details retrieved successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(
    @Param('id') id: string,
    @Request() req,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.findOne(id, req.user.userId);
  }
}
