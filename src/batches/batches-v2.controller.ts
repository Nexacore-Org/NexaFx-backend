import { Controller, Post, Param, Body, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionsService } from '../transactions/services/transaction.service';
import { TransactionResponseDto } from '../transactions/dtos/transaction-response.dto';

export class ExecuteBatchDto {
  @ApiPropertyOptional({
    example: 'user-note-123',
    description: 'Optional reference',
  })
  @IsOptional()
  @IsString()
  reference?: string;
}

@ApiTags('Batches-v2')
@ApiBearerAuth('access-token')
@Controller({ path: 'batches', version: '2' })
export class BatchesV2Controller {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post(':id/execute')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Required idempotency key (max 128 chars, alphanumeric/hyphens/underscores)',
    example: 'batch_exec_1234567890',
  })
  @ApiOperation({ summary: 'Execute a batch (v2 - requires Idempotency-Key)' })
  @ApiParam({ name: 'id', description: 'Batch UUID' })
  @ApiResponse({
    status: 201,
    description: 'Batch executed successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key header is required',
  })
  @ApiResponse({ status: 400, description: 'Invalid Idempotency-Key format' })
  async executeBatch(
    @Param('id') batchId: string,
    @Request() req,
    @Body() executeBatchDto: ExecuteBatchDto,
  ): Promise<TransactionResponseDto> {
    // Placeholder - actual batch execution would interact with batch processing service
    // For now, this just demonstrates the idempotency key enforcement
    return {
      id: batchId,
      userId: req.user.userId,
      amount: '0',
      currency: 'XLM',
      status: 'SUCCESS' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TransactionResponseDto;
  }
}
