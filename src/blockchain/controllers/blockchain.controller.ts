import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { StellarService } from '../services/stellar.service';
import {
  StellarAccountDto,
  StellarTransactionDto,
} from '../dto/stellar-transaction.dto';
import { AssetBalance, StellarTransactionResult } from '../dto/stellar.dto';

@ApiTags('Blockchain')
@Controller('blockchain/stellar')
export class BlockchainController {
  private readonly logger = new Logger(BlockchainController.name);

  constructor(private readonly stellarService: StellarService) {}

  @Post('transaction')
  @ApiOperation({ summary: 'Send a Stellar transaction' })
  @ApiBody({
    type: StellarTransactionDto,
    examples: {
      default: {
        summary: 'Stellar Transaction Example',
        value: {
          destinationAddress: 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
          amount: '100.50',
          asset: 'XLM',
          memo: 'Payment for services',
          timeout: 300
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Transaction submitted successfully', type: Object })
  @ApiResponse({ status: 400, description: 'Bad request or transaction failed' })
  async sendTransaction(
    @Body() transactionDto: StellarTransactionDto,
  ): Promise<StellarTransactionResult> {
    try {
      const result = await this.stellarService.sendTransaction(transactionDto);
      if (!result.successful) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Transaction failed: ${result.errorMessage}`,
            details: result,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        `Error processing transaction: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message || 'Failed to process Stellar transaction',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('account/:address/exists')
  @ApiOperation({ summary: 'Check if a Stellar account exists' })
  @ApiParam({ name: 'address', description: 'Stellar account address' })
  @ApiResponse({ status: 200, description: 'Returns whether the account exists', type: Object })
  async checkAccountExists(
    @Param() params: StellarAccountDto,
  ): Promise<{ exists: boolean }> {
    try {
      const exists = await this.stellarService.accountExists(params.address);
      return { exists };
    } catch (error) {
      this.logger.error(
        `Error checking account: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message || 'Failed to check Stellar account',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('account/:address/balances')
  @ApiOperation({ summary: 'Get Stellar account balances' })
  @ApiParam({ name: 'address', description: 'Stellar account address' })
  @ApiResponse({ status: 200, description: 'Returns account balances' })
  async getAccountBalances(
    @Param() params: StellarAccountDto,
  ): Promise<{ balances: AssetBalance[] }> {
    try {
      const balances = await this.stellarService.getAccountBalances(
        params.address,
      );
      return { balances };
    } catch (error) {
      this.logger.error(
        `Error fetching balances: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message || 'Failed to fetch account balances',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
