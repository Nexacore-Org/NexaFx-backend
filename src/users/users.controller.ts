import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  ProfileResponseDto,
  WalletBalancesResponseDto,
  WalletPortfolioResponseDto,
  DeviceTokenDto,
  RateLimitStatusDto,
} from './dto';
import { DataExportService } from './services/data-export.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { DataRequestType } from './entities/data-request.entity';
@ApiTags('Users')
@Controller('users')
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly dataExportService: DataExportService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(
    @Request() req: { user: { userId: string } },
  ): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(req.user.userId);
  }

  @Post('me/data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request data export (GDPR Article 15)' })
  @ApiResponse({
    status: 202,
    description: 'Data export request accepted and is being processed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 409, description: 'A data export is already in progress' })
  async requestDataExport(
    @Request() req: { user: { userId: string } },
  ) {
    const dataRequest = await this.dataExportService.requestDataExport(req.user.userId);
    return { 
      message: 'Data export request accepted and is being processed',
      requestId: dataRequest.id,
      status: dataRequest.status,
    };
  }

  @Post('me/data-export/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a failed data export request' })
  @ApiResponse({
    status: 202,
    description: 'Data export retry accepted',
  })
  async retryDataExport(
    @Request() req: { user: { userId: string } },
  ) {
    const dataRequest = await this.dataExportService.requestDataExport(req.user.userId);
    return {
      message: 'Data export retry accepted',
      requestId: dataRequest.id,
    };
  }

  @Get('me/data-export/status')
  @ApiOperation({ summary: 'Get data export request status' })
  @ApiResponse({
    status: 200,
    description: 'Data export status retrieved',
  })
  async getDataExportStatus(
    @Request() req: { user: { userId: string } },
  ) {
    const requests = await this.dataExportService.getUserRequests(req.user.userId);
    return { requests };
  }

  @Post('me/delete-account')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request account deletion (GDPR Article 17)' })
  @ApiResponse({
    status: 202,
    description: 'Account deletion request accepted and is being processed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async requestAccountDeletion(
    @Request() req: { user: { userId: string } },
  ) {
    const dataRequest = await this.accountDeletionService.requestAccountDeletion(req.user.userId);
    return {
      message: 'Account deletion request accepted and is being processed. Your PII will be anonymized and your account will be inaccessible.',
      requestId: dataRequest.id,
      hardDeleteInDays: 30,
    };
  }

  @Delete('profile')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Delete current user account (legacy - use POST me/delete-account)' })
  @ApiResponse({
    status: 202,
    description: 'Account deletion request accepted and is being processed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteProfile(
    @Request() req: { user: { userId: string } },
  ) {
    await this.usersService.deleteProfile(req.user.userId);
    return { 
      message: 'Account deletion request accepted. Your PII has been marked for anonymization.' 
    };
  }

  @Get('wallet/balances')
  @ApiOperation({
    summary: 'Get live wallet balances with USD/NGN equivalents (cached for 30 seconds)',
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
    summary: 'Get portfolio totals and percentage breakdown across wallet holdings',
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
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @Request() req: { user: { userId: string } },
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.usersService.updateProfile(req.user.userId, updateProfileDto);
  }

  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiBody({ type: DeviceTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Device token registered successfully',
  })
  async registerDeviceToken(
    @Request() req: { user: { userId: string } },
    @Body() body: DeviceTokenDto,
  ): Promise<{ message: string }> {
    await this.usersService.registerDeviceToken(req.user.userId, body.token);
    return { message: 'Device token registered successfully' };
  }

  @Delete('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a device token for push notifications' })
  @ApiBody({ type: DeviceTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Device token removed successfully',
  })
  async removeDeviceToken(
    @Request() req: { user: { userId: string } },
    @Body() body: DeviceTokenDto,
  ): Promise<{ message: string }> {
    await this.usersService.removeDeviceToken(req.user.userId, body.token);
    return { message: 'Device token removed successfully' };
  }

  @Get('me/rate-limit')
  @ApiOperation({ summary: 'Get current user rate limit status' })
  @ApiResponse({
    status: 200,
    description: 'Returns rate limit information',
    type: RateLimitStatusDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getRateLimitStatus(
    @Request() req: { user: { userId: string } },
  ): Promise<RateLimitStatusDto> {
    return this.usersService.getRateLimitStatus(req.user.userId);
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

  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiBody({ type: DeviceTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Device token registered successfully',
  })
  async registerDeviceToken(
    @Request() req: { user: { userId: string } },
    @Body() body: DeviceTokenDto,
  ): Promise<{ message: string }> {
    await this.usersService.registerDeviceToken(req.user.userId, body.token);
    return { message: 'Device token registered successfully' };
  }

  @Delete('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a device token for push notifications' })
  @ApiBody({ type: DeviceTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Device token removed successfully',
  })
  async removeDeviceToken(
    @Request() req: { user: { userId: string } },
    @Body() body: DeviceTokenDto,
  ): Promise<{ message: string }> {
    await this.usersService.removeDeviceToken(req.user.userId, body.token);
    return { message: 'Device token removed successfully' };
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

  @Get('me/rate-limit')
  @ApiOperation({ summary: 'Get current user rate limit status' })
  @ApiResponse({
    status: 200,
    description: 'Returns rate limit information',
    type: RateLimitStatusDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getRateLimitStatus(
    @Request() req: { user: { userId: string } },
  ): Promise<RateLimitStatusDto> {
    return this.usersService.getRateLimitStatus(req.user.userId);
  }
}
