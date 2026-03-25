import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { BankAccountService } from '../services/bank-account.service';
import { LinkBankAccountDto } from '../dto/link-bank-account.dto';
import { VerifyBankAccountDto } from '../dto/verify-bank-account.dto';
import { CreateBankDepositDto, CreateBankWithdrawalDto } from '../dto/bank-transfer.dto';
import { PaymentRailWebhookDto } from '../dto/payment-rail-webhook.dto';
import { BankAccountResponseDto } from '../dto/bank-account-response.dto';
import { TransactionResponseDto } from '../../../transactions/dtos/transaction-response.dto';

@ApiTags('Banking')
@ApiBearerAuth('access-token')
@Controller()
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Link a bank account and initiate micro-deposit verification' })
  @ApiBody({ type: LinkBankAccountDto })
  @ApiResponse({ status: 201, type: BankAccountResponseDto })
  linkBankAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: LinkBankAccountDto,
  ) {
    return this.bankAccountService.linkBankAccount(user.userId, dto);
  }

  @Post('bank-accounts/:id/verify')
  @ApiOperation({ summary: 'Verify a bank account with micro-deposit amounts' })
  @ApiBody({ type: VerifyBankAccountDto })
  @ApiResponse({ status: 201, type: BankAccountResponseDto })
  verifyBankAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: VerifyBankAccountDto,
  ) {
    return this.bankAccountService.verifyBankAccount(user.userId, id, dto);
  }

  @Post('deposits/bank')
  @ApiOperation({ summary: 'Initiate a bank deposit into the wallet' })
  @ApiBody({ type: CreateBankDepositDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  createBankDeposit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBankDepositDto,
  ) {
    return this.bankAccountService.createBankDeposit(user.userId, dto);
  }

  @Post('withdrawals/bank')
  @ApiOperation({ summary: 'Initiate a bank withdrawal and reserve wallet balance' })
  @ApiBody({ type: CreateBankWithdrawalDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  createBankWithdrawal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBankWithdrawalDto,
  ) {
    return this.bankAccountService.createBankWithdrawal(user.userId, dto);
  }

  @Public()
  @Post('banking/webhooks/payment-rail')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process payment rail settlement webhook' })
  @ApiBody({ type: PaymentRailWebhookDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  handlePaymentRailWebhook(@Body() dto: PaymentRailWebhookDto) {
    return this.bankAccountService.applySettlementWebhook(dto);
  }
}
