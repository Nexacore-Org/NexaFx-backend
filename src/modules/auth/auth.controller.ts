import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyFraudOtpDto } from './dto/verify-fraud-otp.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user and return JWT tokens' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 15 * 60 * 1000,
      limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 5),
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate a user and return JWT tokens' })
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    return this.authService.login(loginDto, ipAddress);
  }

  @Public()
  @Post('verify-fraud-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify fraud OTP sent when risk score ≥ 50, then receive full JWT tokens',
  })
  async verifyFraudOtp(@Body() verifyDto: VerifyFraudOtpDto) {
    return this.authService.verifyFraudOtp(verifyDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a refresh token and return a new access token',
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate the current refresh token' })
  async logout(
    @Req() req: { user?: { sub?: string } },
    @Body() dto?: Partial<RefreshTokenDto>,
  ) {
    if (!req.user?.sub) {
      return { message: 'Logged out successfully' };
    }

    return this.authService.logout(req.user.sub, dto?.refreshToken);
  }
}
