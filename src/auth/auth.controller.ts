import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
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
    description: 'OTP verified successfully, tokens issued',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async verifyLoginOtp(@Body() verifyDto: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(verifyDto);
  }

  @Public()
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
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP' })
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
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' },
      },
      required: ['refreshToken'],
    },
  })
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
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }
}
