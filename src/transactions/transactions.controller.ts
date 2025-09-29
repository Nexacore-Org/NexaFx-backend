/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Req,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  Query,
  ConflictException,
  ForbiddenException,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/user/entities/user.entity';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { Transaction } from './entities/transaction.entity';
import { TransactionType } from './enums/transaction-type.enum';
import { TransactionStatus } from './enums/transaction-status.enum';
import { AuditInterceptor } from 'src/audit/audit.interceptor';
import { TransactionsStatsDto } from './dto/transaction-stat.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  @Get('user')
  @Roles(UserRole.USER)
  findMyTransactions(@Req() req) {
    const userId = req.user.id;
    // Return only transactions belonging to the authenticated user
  }

  @UseInterceptors(AuditInterceptor)
  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  createTransaction() {
    // Users and Admins can create transactions
  }
  constructor(private readonly transactionsService: TransactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getUserTransactions(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const userId = req.user.id;
    return this.transactionsService.getTransactionsByUser(
      userId,
      +page,
      +limit,
    );
  }

  @UseInterceptors(AuditInterceptor)
  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Transaction created successfully',
    type: Transaction,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Transaction reference already exists',
  })
  @ApiBody({
    type: CreateTransactionDto,
    examples: {
      default: {
        summary: 'Create Transaction Example',
        value: {
          initiatorId: '123e4567-e89b-12d3-a456-426614174000',
          receiverId: '987e6543-e21b-12d3-a456-426614174000',
          type: 'TRANSFER',
          amount: 100.5,
          currencyId: '321e4567-e89b-12d3-a456-426614174000',
          status: 'PENDING',
          reference: 'TXN-2024-0001',
          description: 'Payment for invoice #123',
          metadata: { orderId: 'ORD-001', note: 'Urgent' },
          sourceAccount: 'ACC-001',
          destinationAccount: 'ACC-002',
          feeAmount: 2.5,
          feeCurrencyId: '321e4567-e89b-12d3-a456-426614174000',
          processingDate: '2024-07-01T10:00:00Z',
          completionDate: '2024-07-01T12:00:00Z',
        },
      },
    },
  })
  async create(
    @Body() createTransactionDto: CreateTransactionDto,
    @Request() req,
  ): Promise<Transaction> {
    // Ensure the userId in the DTO matches the authenticated user
    createTransactionDto.initiatorId = req.user.id;

    // Generate reference if not provided
    if (!createTransactionDto.reference) {
      createTransactionDto.reference =
        this.transactionsService.generateReference();
    }

    return this.transactionsService.createTransaction(createTransactionDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Get all transactions for current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of transactions',
    type: [Transaction],
  })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  @ApiQuery({ name: 'status', enum: TransactionStatus, required: false })
  @ApiQuery({ name: 'currencyId', required: false })
  async findAll(
    @Request() req,
    @Query() queryParams: QueryTransactionDto,
  ): Promise<Transaction[]> {
    return this.transactionsService.findAll(req.user.id, queryParams);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction details',
    type: Transaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async findOne(@Param('id') id: string, @Request() req): Promise<Transaction> {
    return this.transactionsService.findOne(id, req.user.id);
  }

  @Get('reference/:reference')
  @ApiOperation({ summary: 'Get a transaction by reference' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction details',
    type: Transaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found',
  })
  async findByReference(
    @Param('reference') reference: string,
    @Request() req,
  ): Promise<Transaction> {
    const transaction =
      await this.transactionsService.findByReference(reference);

    // Check if the transaction belongs to the current user
    if (transaction.initiatorId !== req.user.id) {
      throw new ForbiddenException(
        'You do not have permission to access this transaction',
      );
    }

    return transaction;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a transaction' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction updated successfully',
    type: Transaction,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Transaction reference already exists',
  })
  @ApiBody({
    type: UpdateTransactionDto,
    examples: {
      default: {
        summary: 'Update Transaction Example',
        value: {
          amount: 200.75,
          description: 'Payment for invoice #456 (updated)',
          reference: 'TXN-2024-0002',
          metadata: { orderId: 'ORD-002', note: 'Updated note' },
          sourceAccount: 'ACC-003',
          destinationAccount: 'ACC-004',
          feeAmount: 3.0,
          feeCurrencyId: '321e4567-e89b-12d3-a456-426614174000',
          processingDate: '2024-07-02T10:00:00Z',
          completionDate: '2024-07-02T12:00:00Z',
        },
      },
    },
  })
  async update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @Request() req,
  ): Promise<Transaction> {
    // Ensure user cannot change userId
    if (
      updateTransactionDto.initiatorId &&
      updateTransactionDto.initiatorId !== req.user.id
    ) {
      delete updateTransactionDto.initiatorId;
    }

    return this.transactionsService.update(
      id,
      updateTransactionDto,
      req.user.id,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a transaction' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Transaction deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    return this.transactionsService.remove(id, req.user.id);
  }

  @Get('stats')
  async getStats(): Promise<TransactionsStatsDto> {
    return this.transactionsService.getStats();
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'COMPLETED' },
      },
      required: ['status'],
    },
    examples: {
      default: {
        summary: 'Update Transaction Status Example',
        value: { status: 'COMPLETED' },
      },
    },
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionStatusDto,
  ) {
    return this.transactionsService.updateStatus(id, dto.status);
  }
}
