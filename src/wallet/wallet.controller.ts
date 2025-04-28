import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { Wallet } from './entities/wallet.entity';

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new wallet' })
  @ApiResponse({
    status: 201,
    description: 'Wallet created successfully',
    type: Wallet,
  })
  @ApiResponse({ status: 409, description: 'User already has a wallet' })
  create(@Request() req, @Body() createWalletDto: CreateWalletDto) {
    return this.walletService.create(req.user.id, createWalletDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all wallets for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Return all wallets',
    type: [Wallet],
  })
  findAll(@Request() req) {
    return this.walletService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific wallet' })
  @ApiResponse({ status: 200, description: 'Return the wallet', type: Wallet })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.walletService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a wallet' })
  @ApiResponse({
    status: 200,
    description: 'Wallet updated successfully',
    type: Wallet,
  })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateWalletDto: UpdateWalletDto,
  ) {
    return this.walletService.update(id, req.user.id, updateWalletDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a wallet' })
  @ApiResponse({ status: 200, description: 'Wallet deleted successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  remove(@Request() req, @Param('id') id: string) {
    return this.walletService.remove(id, req.user.id);
  }
}
