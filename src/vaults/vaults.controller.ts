import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { DepositDto } from './dto/deposit.dto';
import { VaultResponseDto } from './dto/vault-response.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { SavingsVault } from './entities/savings-vault.entity';
import { VaultTransaction } from './entities/vault-transaction.entity';

@ApiTags('Vaults')
@ApiBearerAuth()
@Controller('vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new savings vault' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateVaultDto,
  ): Promise<SavingsVault> {
    return this.vaultsService.create(user.userId, dto);
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Deposit funds from main wallet into vault' })
  async deposit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DepositDto,
  ): Promise<{ vault: SavingsVault; transaction: VaultTransaction }> {
    return this.vaultsService.deposit(id, user.userId, dto.amount);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw entire balance from vault' })
  async withdraw(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<{ vault: SavingsVault; transactions: VaultTransaction[] }> {
    return this.vaultsService.withdraw(id, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all vaults for the current user' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<VaultResponseDto[]> {
    return this.vaultsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vault details with transaction history' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<VaultResponseDto> {
    return this.vaultsService.findOne(id, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a vault (only if MATURED or CLOSED)' })
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.vaultsService.delete(id, user.userId);
  }
}
