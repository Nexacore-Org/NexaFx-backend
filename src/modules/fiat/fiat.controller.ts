import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { FiatService } from './fiat.service';
import { CreateDepositDto, CreateWithdrawalDto, VerifyBankAccountDto } from './dto/fiat.dto';

@ApiTags('Fiat')
@ApiBearerAuth('access-token')
@Controller('fiat')
export class FiatController {
  private readonly logger = new Logger(FiatController.name);

  constructor(private readonly fiatService: FiatService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a fiat deposit via bank transfer' })
  @ApiBody({ type: CreateDepositDto })
  @ApiResponse({ status: 201, description: 'Deposit initiated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async initiateDeposit(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateDepositDto,
  ) {
    return this.fiatService.initiateDeposit(req.user.userId, dto);
  }

  @Get('deposits')
  @ApiOperation({ summary: 'List user fiat deposits' })
  @ApiResponse({ status: 200, description: 'Deposits retrieved successfully' })
  async getDeposits(@Request() req: { user: { userId: string } }) {
    return this.fiatService.getDeposits(req.user.userId);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a fiat withdrawal to bank account' })
  @ApiBody({ type: CreateWithdrawalDto })
  @ApiResponse({ status: 201, description: 'Withdrawal initiated successfully' })
  @ApiResponse({ status: 403, description: 'KYC approval required' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid request' })
  async initiateWithdrawal(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateWithdrawalDto,
  ) {
    return this.fiatService.initiateWithdrawal(req.user.userId, dto);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List user fiat withdrawals' })
  @ApiResponse({ status: 200, description: 'Withdrawals retrieved successfully' })
  async getWithdrawals(@Request() req: { user: { userId: string } }) {
    return this.fiatService.getWithdrawals(req.user.userId);
  }

  @Post('bank-account/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify bank account details' })
  @ApiBody({ type: VerifyBankAccountDto })
  @ApiResponse({ status: 200, description: 'Account verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid bank details' })
  async verifyBankAccount(@Body() dto: VerifyBankAccountDto) {
    return this.fiatService.verifyBankAccount(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process fiat provider webhook' })
  @ApiHeader({ name: 'verif-hash', description: 'Webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(
    @Headers('verif-hash') signature: string,
    @Request() req: RawBodyRequest<Request>,
  ) {
    const payload = req.body;
    
    try {
      // Determine if this is a deposit or withdrawal webhook based on event type
      if (payload.event?.includes('payment') || payload.data?.tx_ref?.startsWith('FIAT_DEP_')) {
        return this.fiatService.processDepositWebhook(payload, signature);
      } else if (payload.event?.includes('transfer') || payload.data?.reference?.startsWith('FIAT_WD_')) {
        return this.fiatService.processWithdrawalWebhook(payload, signature);
      } else {
        this.logger.warn(`Unknown webhook event type: ${payload.event}`);
        return { success: false, message: 'Unknown event type' };
      }
    } catch (error) {
      this.logger.error(`Webhook processing error: ${error.message}`);
      throw error;
    }
  }
}
