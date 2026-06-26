import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifySignupOtpDto } from './dto/verify-signup-otp.dto';
import { VerifySignupResponseDto } from './dto/signup-response.dto';
import { VerifyLoginOtpResponseDto } from './dto/signup-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UnlinkOauthDto } from './dto/unlink-oauth.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('verify-login-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify login OTP and receive access tokens' })
  @ApiBody({ type: VerifyLoginOtpDto })
  @ApiResponse({
    status: 200,
    description:
      'OTP verified. Returns full auth tokens + user object (including name) when no 2FA is required, or a twoFactorToken challenge when 2FA is enabled.',
    type: VerifyLoginOtpResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async verifyLoginOtp(@Body() verifyDto: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(verifyDto);
  }

  @Public()
  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify authenticator app TOTP and receive access tokens',
  })
  @ApiBody({ type: VerifyTwoFactorDto })
  @ApiResponse({
    status: 200,
    description:
      '2FA verified. Returns full auth tokens + user object (including name).',
    type: VerifyLoginOtpResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired 2FA token/code',
  })
  async verifyTwoFactor(@Body() verifyDto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactor(verifyDto);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    },
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate password reset flow' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset OTP sent',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async forgotPassword(@Body() forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    },
  })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using OTP',
    description:
      'Completes the password-reset flow. Call POST /auth/forgot-password first ' +
      'to receive a 6-digit OTP by email, then submit that OTP here together with ' +
      'the registered email and the desired new password.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — one or more fields are missing or invalid. ' +
      'The response body contains an `errors` array with per-field messages.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Validation failed' },
        errors: {
          type: 'array',
          items: { type: 'string' },
          example: [
            'email must be a valid email address',
            'otp must be exactly 6 characters',
            'newPassword must be at least 12 characters',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP, or account not found',
  })
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'New access token issued',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    },
  })
  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 200,
    description: 'Account created, OTP sent to email',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Phone already registered' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Public()
  @Post('verify-signup-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify signup OTP and complete registration' })
  @ApiBody({ type: VerifySignupOtpDto })
  @ApiResponse({
    status: 200,
    description: 'Signup verified, tokens issued',
    type: VerifySignupResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({
    status: 400,
    description: 'Account already verified or invalid request',
  })
  async verifySignupOtp(@Body() verifyDto: VerifySignupOtpDto) {
    return this.authService.verifySignupOtp(verifyDto);
  }

  @Public()
  @Post('resend-signup-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend signup verification OTP' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'If a pending signup exists, OTP has been resent',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async resendSignupOtp(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendSignupOtp(dto.email);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Req() req: any) {
    const userId = req.user.userId;
    const tokenId = req.user.jti; // JWT ID
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    return this.authService.logout(userId, tokenId, ipAddress, userAgent);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logout from all devices successful',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logoutAllDevices(@Req() req: any) {
    const userId = req.user.userId;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    return this.authService.logoutAllDevices(userId, ipAddress, userAgent);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  async googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback handler' })
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = req.user;
    if (result?.error) {
      return res.redirect(
        this.configService.get<string>(
          'OAUTH_FAILURE_REDIRECT',
          'http://localhost:3001/login?error=oauth_failed',
        ),
      );
    }

    const tokens = await this.authService.issueFullAccessToken(result.user.id);
    const redirectUrl = new URL(
      this.configService.get<string>(
        'OAUTH_SUCCESS_REDIRECT',
        'http://localhost:3001/auth/callback',
      ),
    );
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);
    redirectUrl.searchParams.set('expiresIn', String(tokens.expiresIn));
    redirectUrl.searchParams.set('isNew', String(result.isNew));

    return res.redirect(redirectUrl.toString());
  }

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Redirect to GitHub OAuth consent screen' })
  async githubAuth() {}

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback handler' })
  async githubAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = req.user;
    if (result?.error) {
      return res.redirect(
        this.configService.get<string>(
          'OAUTH_FAILURE_REDIRECT',
          'http://localhost:3001/login?error=oauth_failed',
        ),
      );
    }

    const tokens = await this.authService.issueFullAccessToken(result.user.id);
    const redirectUrl = new URL(
      this.configService.get<string>(
        'OAUTH_SUCCESS_REDIRECT',
        'http://localhost:3001/auth/callback',
      ),
    );
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);
    redirectUrl.searchParams.set('expiresIn', String(tokens.expiresIn));
    redirectUrl.searchParams.set('isNew', String(result.isNew));

    return res.redirect(redirectUrl.toString());
  }

  @Post('oauth/unlink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink an OAuth provider from your account' })
  @ApiBody({ type: UnlinkOauthDto })
  @ApiResponse({ status: 200, description: 'OAuth account unlinked' })
  @ApiResponse({ status: 422, description: 'Cannot unlink — no password set' })
  async unlinkOauth(@Req() req: any, @Body() dto: UnlinkOauthDto) {
    const userId = req.user.userId;
    await this.authService.unlinkOAuth(userId, dto.provider);
    return { message: `${dto.provider} account unlinked successfully` };
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a password for OAuth-only accounts' })
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password set successfully' })
  @ApiResponse({ status: 400, description: 'User already has a password' })
  async setPassword(@Req() req: any, @Body() dto: SetPasswordDto) {
    const userId = req.user.userId;
    await this.authService.setPassword(userId, dto.newPassword);
    return {
      message:
        'Password set successfully. You can now log in with your email and password.',
    };
  }
}
