import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import {
  GenerateWalletDto,
  ImportWalletDto,
  UpdateWalletLabelDto,
} from './dto/wallet.dto';

@ApiTags('Wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new Stellar wallet for the current user' })
  @ApiBody({ type: GenerateWalletDto, required: false })
  @ApiResponse({ status: 201, description: 'Wallet created' })
  async generate(
    @Request() req: { user: { userId: string } },
    @Body() dto: GenerateWalletDto,
  ) {
    return this.walletsService.generateWallet(req.user.userId, dto);
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Import a watch-only wallet by public key' })
  @ApiBody({ type: ImportWalletDto })
  @ApiResponse({ status: 201, description: 'Wallet imported' })
  async import(
    @Request() req: { user: { userId: string } },
    @Body() dto: ImportWalletDto,
  ) {
    return this.walletsService.importWatchOnly(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List wallets with live Stellar balances' })
  @ApiResponse({ status: 200, description: 'Wallets returned' })
  async list(@Request() req: { user: { userId: string } }) {
    return this.walletsService.listWallets(req.user.userId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Update wallet label' })
  @ApiBody({ type: UpdateWalletLabelDto })
  async updateLabel(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletLabelDto,
  ) {
    return this.walletsService.updateLabel(req.user.userId, id, dto.label);
  }

  @Patch(':id/set-default')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Set wallet as default (atomic)' })
  @ApiResponse({ status: 200, description: 'Default wallet updated' })
  async setDefault(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.walletsService.setDefault(req.user.userId, id);
    return { message: 'Default wallet updated' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Delete a non-default wallet' })
  @ApiResponse({ status: 400, description: 'Cannot delete only or default wallet' })
  async remove(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.walletsService.deleteWallet(req.user.userId, id);
    return { message: 'Wallet removed' };
  }
}
