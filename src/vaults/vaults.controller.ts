import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { DepositDto } from './dto/deposit.dto';
import { VaultResponseDto } from './dto/vault-response.dto';

@ApiTags('Vaults')
@ApiBearerAuth('access-token')
@Controller('vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a savings vault' })
  @ApiResponse({ status: 201, type: VaultResponseDto })
  async create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateVaultDto,
  ): Promise<VaultResponseDto> {
    return this.vaultsService.createVault(req.user.userId, dto);
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Deposit from main wallet to vault' })
  @ApiResponse({ status: 200, type: VaultResponseDto })
  async deposit(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepositDto,
  ): Promise<VaultResponseDto> {
    return this.vaultsService.deposit(req.user.userId, id, dto.amount);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw entire vault balance' })
  @ApiResponse({ status: 200, type: VaultResponseDto })
  async withdraw(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VaultResponseDto> {
    return this.vaultsService.withdraw(req.user.userId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List user savings vaults with progress' })
  @ApiResponse({ status: 200, type: [VaultResponseDto] })
  async list(
    @Request() req: { user: { userId: string } },
  ): Promise<VaultResponseDto[]> {
    return this.vaultsService.listVaults(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vault detail with transaction history' })
  @ApiResponse({ status: 200, type: VaultResponseDto })
  async get(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VaultResponseDto> {
    return this.vaultsService.getVaultDetail(req.user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete vault (only if MATURED or CLOSED)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 422, description: 'Cannot delete ACTIVE vault' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.vaultsService.deleteVault(req.user.userId, id);
  }
}
