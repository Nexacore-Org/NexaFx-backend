import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/providers/user.service';
import { BcryptPasswordHashingService } from './bcrypt-password-hashing.service';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly passwordService: BcryptPasswordHashingService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // Validate User Credentials
  public async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (user && (await this.passwordService.compare(password, user.password))) {
      return user;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  //Login Method (Generate JWT tokens)
  public login(user: any) {
    const payload = { email: user.email, sub: user.id };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }), // No DB storage
    };
  }

  //Refresh Token Method (No DB lookup)
  public async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify<{ email: string; sub: number }>(
        token,
      );
      const user = await this.usersService.findOne(decoded.email);
      if (!user) throw new UnauthorizedException('Invalid refresh token');

      return this.login(user); // Issue new tokens
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  //Logout (No DB token storage, so just return message)
  public logout() {
    return { message: 'Logged out successfully' };
  }
}
