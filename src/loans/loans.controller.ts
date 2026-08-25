import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user.entity';
import {
  ApplyLoanDto,
  RepayLoanDto,
  AdminApproveLoanDto,
  AdminRejectLoanDto,
  LoanQueryDto,
} from './dto/loan.dto';

@ApiTags('Loans')
@ApiBearerAuth()
@Controller()
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  // ── User endpoints ──────────────────────────────────────────────────────────

  @Post('v2/loans/apply')
  @ApiOperation({ summary: 'Apply for a micro-loan (requires ENHANCED KYC)' })
  async apply(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ApplyLoanDto,
  ) {
    return this.loansService.applyForLoan(user.userId, dto);
  }

  @Get('v2/loans')
  @ApiOperation({ summary: 'List the current user\'s loan applications' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    return this.loansService.getUserLoans(user.userId);
  }

  @Get('v2/loans/:id')
  @ApiOperation({ summary: 'Get a loan with its repayment schedule' })
  async getOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loansService.getLoanById(user.userId, id);
  }

  @Post('v2/loans/:id/repay')
  @ApiOperation({ summary: 'Make a manual repayment on a loan' })
  async repay(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepayLoanDto,
  ) {
    return this.loansService.repayLoan(user.userId, id, dto);
  }

  // ── Admin endpoints ─────────────────────────────────────────────────────────

  @Get('admin/loans')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Admin: list all loan applications (queue)' })
  async adminList(@Query() query: LoanQueryDto) {
    return this.loansService.adminGetLoans(query.page, query.limit);
  }

  @Patch('admin/loans/:id/approve')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Admin: approve a loan and disburse funds' })
  async adminApprove(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminApproveLoanDto,
  ) {
    return this.loansService.adminApproveLoan(admin.userId, id, dto);
  }

  @Patch('admin/loans/:id/reject')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Admin: reject a loan application' })
  async adminReject(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminRejectLoanDto,
  ) {
    return this.loansService.adminRejectLoan(admin.userId, id, dto);
  }
}
