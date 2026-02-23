import { 
  Controller, 
  Get, 
  Param, 
  Query, 
  UseGuards, 
  Request,
  Res,
  HttpStatus,
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ReceiptsService } from './receipts.service';

@ApiTags('Receipts')
@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get('transaction/:id')
  @ApiOperation({ summary: 'Download transaction receipt PDF' })
  @ApiParam({
    name: 'id',
    description: 'Transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF receipt generated successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTransactionReceipt(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const pdfBuffer = await this.receiptsService.generateTransactionReceipt(id, user.userId);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      });
      
      res.send(pdfBuffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({ message: error.message });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
          message: 'Failed to generate receipt' 
        });
      }
    }
  }

  @Get('statement')
  @ApiOperation({ summary: 'Download monthly statement PDF' })
  @ApiQuery({
    name: 'month',
    description: 'Month in YYYY-MM format',
    example: '2026-01',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'PDF statement generated successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid month format' })
  @ApiResponse({ status: 404, description: 'No transactions found for period' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMonthlyStatement(
    @Query('month') month: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Validate month format
      const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
      if (!monthRegex.test(month)) {
        throw new BadRequestException('Invalid month format. Use YYYY-MM');
      }

      const pdfBuffer = await this.receiptsService.generateMonthlyStatement(user.userId, month);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="statement-${month}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      });
      
      res.send(pdfBuffer);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        res.status(error instanceof NotFoundException ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST)
           .json({ message: error.message });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
          message: 'Failed to generate statement' 
        });
      }
    }
  }

  @Get('transaction/:id/email')
  @ApiOperation({ summary: 'Email transaction receipt' })
  @ApiParam({
    name: 'id',
    description: 'Transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Receipt sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async emailTransactionReceipt(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ message: string }> {
    try {
      await this.receiptsService.emailTransactionReceipt(id, user.userId);
      return { message: 'Receipt sent to your registered email address' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new NotFoundException('Failed to send receipt');
      }
    }
  }
}
