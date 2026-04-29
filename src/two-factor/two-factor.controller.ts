import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  UnauthorizedException,
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
import { RecoverTwoFactorDto } from './dto/recover-two-factor.dto';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';

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
  @ApiOperation({
    summary: 'Confirm two-factor authentication and generate backup codes',
  })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor authentication confirmed and backup codes issued',
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
    return this.twoFactorService.confirmTwoFactor(
      req.user.userId,
      dto.totpCode,
    );
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
    await this.twoFactorService.disableTwoFactor(req.user.userId, dto.totpCode);

    return { message: 'Two-factor authentication disabled' };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify TOTP and exchange PARTIAL_AUTH for full JWT',
  })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor verified, full access token issued',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  async verify(
    @Request() req: { user: { userId: string; authStage?: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const ok = await this.twoFactorService.verifyTotpCode(
      req.user.userId,
      dto.totpCode,
    );
    if (!ok) {
      throw new UnauthorizedException('Invalid two-factor code');
    }
    return this.authService.issueFullAccessToken(req.user.userId);
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: 'Use a backup code instead of TOTP to complete 2FA',
  })
  @ApiBody({ type: RecoverTwoFactorDto })
  @ApiResponse({
    status: 200,
    description: 'Backup code accepted, full access token issued',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  async recover(
    @Body() dto: RecoverTwoFactorDto,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const userId = this.authService.getUserIdFromPartialAuth(
      dto.twoFactorToken,
    );
    await this.twoFactorService.consumeBackupCode(userId, dto.backupCode);
    return this.authService.issueFullAccessToken(userId);
  }

  @Get('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate backup codes (requires active TOTP)',
  })
  @ApiResponse({
    status: 200,
    description: 'New backup codes issued; all old codes are invalidated',
    schema: {
      type: 'object',
      properties: {
        backupCodes: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async regenerate(
    @Request() req: { user: { userId: string } },
    @Query('totpCode') totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    if (!totpCode) {
      throw new UnauthorizedException('Invalid two-factor code');
    }
    return this.twoFactorService.regenerateBackupCodes(
      req.user.userId,
      totpCode,
    );
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
}
