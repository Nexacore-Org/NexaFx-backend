import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { BcryptPasswordHashingService } from './bcrypt-password-hashing.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly passwordService: BcryptPasswordHashingService,
  ) {}

  //Register User
  public async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findOne(registerDto.email);
    if (existingUser) throw new ConflictException('Email is already in use');

    const hashedPassword = await this.passwordService.hash(
      registerDto.password,
    );
    const newUser = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });
   
    return this.login(newUser);
  }

  // Validate User Credentials
  public async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (
      user &&
      (await this.passwordService.compare(password, user.password))
    ) {
      return user;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  //Login Method (Generate JWT tokens)
  public async login(user: any) {
    const payload = { email: user.email, sub: user.id };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }), // No DB storage
    };
  }

  //Refresh Token Method (No DB lookup)
  public async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token);
      const user = await this.usersService.findOne(decoded.email);
      if (!user) throw new UnauthorizedException('Invalid refresh token');

      return this.login(user); // Issue new tokens
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  //Logout (No DB token storage, so just return message)
  public async logout() {
    return { message: 'Logged out successfully' };
  }
}
