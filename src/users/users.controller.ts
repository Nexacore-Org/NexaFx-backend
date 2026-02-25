import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  ProfileResponseDto,
  WalletBalancesResponseDto,
  WalletPortfolioResponseDto,
} from './dto';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(
    @Request() req: { user: { userId: string } },
  ): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(req.user.userId);
  }

  @Get('wallet/balances')
  @ApiOperation({
    summary:
      'Get live wallet balances with USD/NGN equivalents (cached for 30 seconds)',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balances fetched successfully',
    type: WalletBalancesResponseDto,
  })
  async getWalletBalances(
    @Request() req: { user: { userId: string } },
  ): Promise<WalletBalancesResponseDto> {
    return this.usersService.getWalletBalances(req.user.userId);
  }

  @Get('wallet/portfolio')
  @ApiOperation({
    summary:
      'Get portfolio totals and percentage breakdown across wallet holdings',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet portfolio fetched successfully',
    type: WalletPortfolioResponseDto,
  })
  async getWalletPortfolio(
    @Request() req: { user: { userId: string } },
  ): Promise<WalletPortfolioResponseDto> {
    return this.usersService.getWalletPortfolio(req.user.userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @Request() req: { user: { userId: string } },
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.usersService.updateProfile(req.user.userId, updateProfileDto);
  }

  @Delete('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({
    status: 200,
    description: 'User account deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Account deleted successfully' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteProfile(
    @Request() req: { user: { userId: string } },
  ): Promise<{ message: string }> {
    await this.usersService.deleteProfile(req.user.userId);
    return { message: 'Account deleted successfully' };
  }
}
