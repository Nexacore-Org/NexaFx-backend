import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AddExternalWalletDto } from './dto/add-external-wallet.dto';
import { UpdateExternalWalletDto } from './dto/update-external-wallet.dto';
import { ExternalWalletResponseDto } from './dto/external-wallet-response.dto';
import { ExternalWalletsService } from './external-wallet.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust import path

@ApiTags('External Wallets')
@ApiBearerAuth()
@Controller('wallets/external')
// @UseGuards(JwtAuthGuard) // Uncomment when you have auth guard
export class ExternalWalletsController {
  constructor(private readonly externalWalletsService: ExternalWalletsService) {}

  @Post('verification-message')
  @ApiOperation({ summary: 'Generate verification message for wallet linking' })
  @ApiResponse({
    status: 200,
    description: 'Verification message generated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  })
  async generateVerificationMessage(@Request() req: any) {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.generateVerificationMessage(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Link a new external wallet' })
  @ApiResponse({
    status: 201,
    description: 'Wallet linked successfully',
    type: ExternalWalletResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid signature or wallet data',
  })
  @ApiResponse({
    status: 409,
    description: 'Wallet already linked',
  })
  async addWallet(
    @Request() req: any,
    @Body() addWalletDto: AddExternalWalletDto,
  ): Promise<ExternalWalletResponseDto> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.addWallet(userId, addWalletDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all linked external wallets' })
  @ApiResponse({
    status: 200,
    description: 'Wallets retrieved successfully',
    type: [ExternalWalletResponseDto],
  })
  async getWallets(@Request() req: any): Promise<ExternalWalletResponseDto[]> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.getWallets(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific external wallet' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({
    status: 200,
    description: 'Wallet retrieved successfully',
    type: ExternalWalletResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async getWallet(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) walletId: string,
  ): Promise<ExternalWalletResponseDto> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.getWallet(userId, walletId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an external wallet' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({
    status: 200,
    description: 'Wallet updated successfully',
    type: ExternalWalletResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async updateWallet(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) walletId: string,
    @Body() updateWalletDto: UpdateExternalWalletDto,
  ): Promise<ExternalWalletResponseDto> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.updateWallet(userId, walletId, updateWalletDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an external wallet' })
  @ApiParam({ name: 'id', description: 'Wallet ID' })
  @ApiResponse({
    status: 204,
    description: 'Wallet removed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async removeWallet(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) walletId: string,
  ): Promise<void> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    return this.externalWalletsService.removeWallet(userId, walletId);
  }

  @Post(':address/validate')
  @ApiOperation({ summary: 'Validate wallet ownership' })
  @ApiParam({ name: 'address', description: 'Wallet address' })
  @ApiResponse({
    status: 200,
    description: 'Wallet ownership validation result',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' }
      }
    }
  })
  async validateWalletOwnership(
    @Request() req: any,
    @Param('address') address: string,
  ): Promise<{ isValid: boolean }> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user ID from JWT
    const isValid = await this.externalWalletsService.validateWalletOwnership(userId, address);
    return { isValid };
  }
}