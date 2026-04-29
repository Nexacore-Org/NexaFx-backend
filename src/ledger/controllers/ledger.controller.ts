import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRole } from '../../users/user.entity';
import { LedgerEntriesQueryDto } from '../dto/ledger-entries-query.dto';
import { LedgerVerificationService } from '../services/ledger-verification.service';

@ApiTags('Admin Ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/ledger')
export class LedgerController {
  constructor(private readonly ledgerVerificationService: LedgerVerificationService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify ledger balance (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns the ledger verification result' })
  async verifyLedger() {
    return this.ledgerVerificationService.verify();
  }

  @Get('entries')
  @ApiOperation({ summary: 'List ledger entries for a transaction (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns matching ledger entries' })
  async getEntries(@Query() query: LedgerEntriesQueryDto) {
    return this.ledgerVerificationService.getEntries(query.transactionId);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get platform balances per currency (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns current balances by currency and account type' })
  async getBalances() {
    return this.ledgerVerificationService.getBalances();
  }
}