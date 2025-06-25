import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './services/auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.token.dto';
import { ThrottleAuth } from 'src/common/decorators/throttle-auth.decorators';
import { UserService } from 'src/user/providers/user.service';
import { JwtRefreshGuard } from './guard/jwt.refresh.guard';

@Controller('auth')
@ThrottleAuth()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  //Login Route
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  //Refresh Token Route
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  //Logout Route (No DB token storage, so just a message)
  @Post('logout')
  logout() {
    return this.authService.logout();
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
   refreshtoken(@Req() req, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const accessToken = this.authService.generateAccessToken(user);
    res.json({ accessToken });
  }
}
