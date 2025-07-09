import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './services/auth.service';
import { LoginDto } from './dto/login.dto';
import { ThrottleAuth } from 'src/common/decorators/throttle-auth.decorators';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { InitiateSignupDto } from './dto/initiate-signup.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { ApiBody } from '@nestjs/swagger';

@Controller('auth')
@ThrottleAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Step 1: Initial login - validate credentials and send OTP
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: LoginDto,
    examples: {
      default: {
        summary: 'Login Example',
        value: {
          identifier: 'user@example.com',
          password: 'StrongPassword123!',
        },
      },
    },
  })
  async initiateLogin(@Body() loginDto: LoginDto) {
    return this.authService.initiateLogin(loginDto);
  }

  // Step 2: Verify OTP and complete login
  @Post('verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: VerifyOtpDto,
    examples: {
      default: {
        summary: 'Verify OTP Example',
        value: { email: 'user@example.com', otpCode: '123456' },
      },
    },
  })
  async completeLogin(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.completeLogin(
      verifyOtpDto.email,
      verifyOtpDto.otpCode,
      response,
    );
  }

  // Refresh tokens
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    return this.authService.refreshToken(refreshToken, response);
  }

  // Logout
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    return this.authService.logout(response, request);
  }

  // Request OTP (for other purposes)
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
      required: ['email'],
    },
    examples: {
      default: {
        summary: 'Request OTP Example',
        value: { email: 'user@example.com' },
      },
    },
  })
  async requestOtp(@Body('email') email: string) {
    return this.authService.requestOtp(email);
  }

  @Post('initiate-signup')
  @HttpCode(HttpStatus.OK)
  async initiateSignup(@Body() dto: InitiateSignupDto) {
    return this.authService.initiateSignup(dto);
  }

  @Post('verify-signup')
  @HttpCode(HttpStatus.OK)
  async verifySignup(
    @Body() dto: VerifySignupDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    return this.authService.verifySignup(dto, response, request);
  }
}
