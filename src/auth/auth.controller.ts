import { Controller, Post, Body, UseGuards, Request, Req } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.token.dto';
import { JwtAuthGuard } from './guard/jwt.auth.guard';
import { ThrottleAuth } from 'src/common/decorators/throttle-auth.decorators';
import { LinkWalletDto } from './dto/link-wallet.dto';

@Controller('auth')
@ThrottleAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //Register Route
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link-wallet')
  async linkWallet(@Body() dto: LinkWalletDto, @Req() req) {
    const user = req.user;
    const updatedUser = await this.authService.linkWallet(user.id, dto.walletAddress, dto.signature);
    return { message: 'Wallet linked successfully', walletAddress: updatedUser.walletAddress };
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
}
