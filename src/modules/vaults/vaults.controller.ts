import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { DepositDto } from './dto/deposit.dto';

@ApiTags('Vaults')
@ApiBearerAuth('access-token')
@Controller('vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new savings vault' })
  create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateVaultDto,
  ) {
    return this.vaultsService.create(req.user.userId, dto);
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Deposit funds from main wallet into vault' })
  deposit(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: DepositDto,
  ) {
    return this.vaultsService.deposit(req.user.userId, id, dto);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw entire vault balance' })
  withdraw(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.vaultsService.withdraw(req.user.userId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List user savings vaults with progress' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Request() req: { user: { userId: string } },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vaultsService.findAll(
      req.user.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vault detail with transaction history' })
  findById(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.vaultsService.findById(req.user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a vault (only if MATURED or CLOSED)' })
  delete(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.vaultsService.delete(req.user.userId, id);
  }
}
