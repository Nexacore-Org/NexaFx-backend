import {
  Controller,
  Post,
  Get,
  UseGuards,
  Query,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { DepositService } from '../providers/deposit.service';
import {
  DepositMethodsResponseDto,
  DepositResponseDto,
  WalletAddressResponseDto,
} from '../dto/deposit-response.dto';
import { CreateDepositDto } from '../dto/create-deposit.dto';

@ApiTags('Deposits')
@Controller('deposit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new deposit request' })
  @ApiResponse({
    status: 201,
    description: 'Deposit request created successfully',
    type: DepositResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid deposit data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createDeposit(
    createDepositDto: CreateDepositDto,
    req: any,
  ): Promise<DepositResponseDto> {
    const userId = req.user.sub;
    return this.depositService.createDeposit(userId, createDepositDto);
  }

  @Get('methods')
  @ApiOperation({ summary: 'Get available deposit methods' })
  @ApiResponse({
    status: 200,
    description: 'Available deposit methods retrieved successfully',
    type: DepositMethodsResponseDto,
  })
  async getDepositMethods(): Promise<DepositMethodsResponseDto> {
    return this.depositService.getDepositMethods();
  }

  @Get('wallet-address/:currency')
  @ApiOperation({ summary: 'Generate wallet address for deposits' })
  @ApiResponse({
    status: 200,
    description: 'Wallet address generated successfully',
    type: WalletAddressResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid currency' })
  async generateWalletAddress(
    @Param('currency') currency: string,
    req: any,
  ): Promise<WalletAddressResponseDto> {
    const userId = req.user.sub;
    return this.depositService.generateWalletAddress(userId, currency);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get user deposit history' })
  @ApiResponse({
    status: 200,
    description: 'Deposit history retrieved successfully',
    type: [DepositResponseDto],
  })
  async getDepositHistory(
    req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
    @Query('currency') currency?: string,
  ) {
    const userId = req.user.sub;
    return this.depositService.getDepositHistory(userId, {
      page: Number(page),
      limit: Number(limit),
      status,
      currency,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific deposit details' })
  @ApiResponse({
    status: 200,
    description: 'Deposit details retrieved successfully',
    type: DepositResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Deposit not found' })
  async getDepositById(
    @Param('id') id: string,
    req: any,
  ): Promise<DepositResponseDto> {
    const userId = req.user.sub;
    return this.depositService.getDepositById(id, userId);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm deposit (for testing purposes)' })
  @ApiResponse({
    status: 200,
    description: 'Deposit confirmed successfully',
    type: DepositResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Deposit not found' })
  async confirmDeposit(
    @Param('id') id: string,
    req: any,
  ): Promise<DepositResponseDto> {
    const userId = req.user.sub;
    return this.depositService.confirmDeposit(id, userId);
  }
}
