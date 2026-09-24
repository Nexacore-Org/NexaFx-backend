import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TransactionReversalService } from '../services/transaction-reversal.service';
import { ConfirmReversalDto } from '../dtos/reversal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Admin - Transaction Reversals')
@Controller('admin/transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class TransactionReversalController {
  constructor(private readonly reversalService: TransactionReversalService) {}

  @Post(':id/reversal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Step 1: Preview reversal (SUPER_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Reversal preview returned' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Reversal already exists' })
  @ApiResponse({ status: 422, description: 'Transaction not reversible' })
  async previewReversal(
    @Param('id') transactionId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.reversalService.previewReversal(transactionId, req.user.userId);
  }

  @Post(':id/reversal/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Step 2: Confirm and execute reversal (SUPER_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Reversal completed' })
  @ApiResponse({ status: 404, description: 'No pending reversal found' })
  @ApiResponse({ status: 409, description: 'Reversal not in pending state' })
  async confirmReversal(
    @Param('id') transactionId: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: ConfirmReversalDto,
  ) {
    return this.reversalService.confirmReversal(transactionId, req.user.userId, dto);
  }
}
