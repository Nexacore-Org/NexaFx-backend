import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/services/users.service';
import { BcryptPasswordHashingService } from './password-hashing.service';
import { Token } from '../entities/token.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly passwordService: BcryptPasswordHashingService,
    @InjectRepository(Token) private readonly tokenRepository: Repository<Token>,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await this.passwordService.comparePassword(password, user.password))) {
      return user;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    await this.tokenRepository.save({
      user,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    const storedToken = await this.tokenRepository.findOne({ where: { refreshToken: token, isRevoked: false } });
    if (!storedToken) throw new UnauthorizedException('Invalid refresh token');

    const user = storedToken.user;
    return this.login(user);
  }

  async logout(token: string) {
    await this.tokenRepository.update({ refreshToken: token }, { isRevoked: true });
  }
}
