import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './services/auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.token.dto';
import { JwtAuthGuard } from './guard/jwt.auth.guard';
import { ThrottleAuth } from 'src/common/decorators/throttle-auth.decorators';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { UserService } from 'src/user/providers/user.service';
import { JwtRefreshGuard } from './guard/jwt.refresh.guard';

@Controller('auth')
@ThrottleAuth()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  //Register Route
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link-wallet')
  async linkWallet(@Body() dto: LinkWalletDto, @Req() req) {
    const user = req.user;
    const updatedUser = await this.authService.linkWallet(
      user.id,
      dto.walletAddress,
      dto.signature,
    );
    return {
      message: 'Wallet linked successfully',
      walletAddress: updatedUser.walletAddress,
    };
  }

  //Login Route
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  //Refresh Token Route
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  //Logout Route (No DB token storage, so just a message)
  @Post('logout')
  async logout() {
    return this.authService.logout();
  }

  //Protected Route Example
  @Post('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }

  @Post('reuest-otp')
  async requestOtp(@Body('email') email: string) {
    await this.authService.reuestOtp(email);
    return { message: 'OTP sent to email' };
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() { email, code }: { email: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const isValid = await this.authService.verifyOtp(email, code);
    if (!isValid) throw new UnauthorizedException('Invalid or expired OTP');

    const user = await this.userService.findOneByEmail(email);
    const accessToken = this.authService.generateAccessToken(user);
    const refreshToken = this.authService.generateRefreshToken(user);

    await this.authService.storeRefreshToken(Number(user.id), refreshToken);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });

    return { accessToken };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refreshtoken(@Req() req, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const accessToken = this.authService.generateAccessToken(user);
    res.json({ accessToken });
  }
}
