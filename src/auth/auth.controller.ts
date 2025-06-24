import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.token.dto';
import { JwtAuthGuard } from './guard/jwt.auth.guard';
import { ThrottleAuth } from 'src/common/decorators/throttle-auth.decorators';

@Controller('auth')
@ThrottleAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
