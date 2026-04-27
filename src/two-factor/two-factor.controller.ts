import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TwoFactorService } from './two-factor.service';
import { SetupTwoFactorResponseDto } from './dto/setup-two-factor-response.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorStatusDto } from './dto/two-factor-status.dto';
import { VerifyTwoFactorDto } from '../auth/dto/verify-2fa.dto';
import { AuthService } from '../auth/auth.service';

@ApiTags('Two Factor')
@ApiBearerAuth('access-token')
@Controller('two-factor')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  @Post('setup')
  @ApiOperation({ summary: 'Generate authenticator setup secret and QR code' })
  @ApiResponse({
    status: 201,
    description: 'Two-factor setup secret generated',
    type: SetupTwoFactorResponseDto,
  })
  async setup(
    @Request() req: { user: { userId: string } },
  ): Promise<SetupTwoFactorResponseDto> {
    return this.twoFactorService.generateSecret(req.user.userId);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm two-factor authentication and get backup codes' })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor authentication enabled and backup codes returned once',
    schema: {
      type: 'object',
      properties: {
        backupCodes: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async confirm(
    @Request() req: { user: { userId: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.twoFactorService.confirmTwoFactor(req.user.userId, dto.totpCode);
  }

  // Backward compatible alias
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enableAlias(
    @Request() req: { user: { userId: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.twoFactorService.confirmTwoFactor(req.user.userId, dto.totpCode);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor authentication disabled',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Two-factor authentication disabled',
        },
      },
    },
  })
  async disable(
    @Request() req: { user: { userId: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ message: string }> {
    await this.twoFactorService.disableTwoFactor(
      req.user.userId,
      dto.totpCode,
    );

    return { message: 'Two-factor authentication disabled' };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get two-factor authentication status' })
  @ApiResponse({
    status: 200,
    description: 'Two-factor status fetched',
    type: TwoFactorStatusDto,
  })
  async status(
    @Request() req: { user: { userId: string } },
  ): Promise<TwoFactorStatusDto> {
    return this.twoFactorService.getStatus(req.user.userId);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP for PARTIAL_AUTH and exchange for full tokens' })
  @ApiBody({ type: VerifyTwoFactorDto })
  async verify(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactor(dto);
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recover login using a backup code' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        twoFactorToken: { type: 'string' },
        backupCode: { type: 'string' },
      },
      required: ['twoFactorToken', 'backupCode'],
    },
  })
  async recover(@Body() body: { twoFactorToken: string; backupCode: string }) {
    return this.authService.verifyTwoFactorWithBackupCode(
      body.twoFactorToken,
      body.backupCode,
    );
  }

  @Get('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes (requires active TOTP)' })
  async regenerate(
    @Request() req: { user: { userId: string } },
    @Query('totpCode') totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    return this.twoFactorService.regenerateBackupCodes(req.user.userId, totpCode);
  }
}
