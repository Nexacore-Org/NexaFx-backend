import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

type AuthUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'role'
  | 'password'
  | 'passwordHash'
  | 'refreshTokenHash'
  | 'isActive'
>;

@Injectable()
export class AuthService {
  private readonly bcryptRounds = 12;
  private readonly accessTokenExpiresIn = '15m';
  private readonly refreshTokenExpiresIn = '7d';
  private readonly invalidPasswordHashPromise = bcrypt.hash(
    '__invalid_password__',
    12,
  );

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = this.normalizeEmail(registerDto.email);
    const existingUser = await this.userRepository.findOne({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(
      registerDto.password,
      this.bcryptRounds,
    );

    const user = this.userRepository.create({
      email,
      firstName: this.normalizeOptionalName(registerDto.firstName),
      lastName: this.normalizeOptionalName(registerDto.lastName),
      password: passwordHash,
      passwordHash,
      role: UserRole.USER,
      isVerified: false,
      isEmailVerified: false,
      isActive: true,
      refreshTokenHash: null,
    });

    const savedUser = await this.userRepository.save(user);
    return this.issueTokenPair(savedUser);
  }

  async login(loginDto: LoginDto) {
    const email = this.normalizeEmail(loginDto.email);
    const user = await this.findAuthUserByEmail(email);

    if (!user || !user.isActive) {
      await this.compareWithDummyHash(loginDto.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = user.passwordHash ?? user.password;
    const isPasswordValid =
      typeof passwordHash === 'string' && passwordHash.length > 0
        ? await bcrypt.compare(loginDto.password, passwordHash)
        : false;

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user);
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(refreshTokenDto.refreshToken);
    const user = await this.findAuthUserById(payload.sub);

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const presentedHash = this.hashRefreshToken(refreshTokenDto.refreshToken);
    if (!this.timingSafeHashEquals(user.refreshTokenHash, presentedHash)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: await this.signAccessToken(user),
    };
  }

  async logout(userId: string) {
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
    });

    return { message: 'Logged out successfully' };
  }

  private async issueTokenPair(user: AuthUser) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.signRefreshToken(user);

    await this.userRepository.update(user.id, {
      refreshTokenHash: this.hashRefreshToken(refreshToken),
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private async signAccessToken(user: Pick<AuthUser, 'id' | 'email' | 'role'>) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      } satisfies JwtPayload,
      {
        secret: this.getAccessTokenSecret(),
        expiresIn: this.accessTokenExpiresIn,
      },
    );
  }

  private async signRefreshToken(user: Pick<AuthUser, 'id' | 'email' | 'role'>) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      } satisfies JwtPayload,
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.refreshTokenExpiresIn,
      },
    );
  }

  private async verifyRefreshToken(token: string) {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async findAuthUserByEmail(email: string): Promise<AuthUser | null> {
    return this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        password: true,
        passwordHash: true,
        refreshTokenHash: true,
        isActive: true,
      },
    }) as Promise<AuthUser | null>;
  }

  private async findAuthUserById(id: string): Promise<AuthUser | null> {
    return this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        password: true,
        passwordHash: true,
        refreshTokenHash: true,
        isActive: true,
      },
    }) as Promise<AuthUser | null>;
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private normalizeOptionalName(value?: string) {
    return value?.trim() || '';
  }

  private getAccessTokenSecret() {
    const secret = this.configService.get<string>('JWT_SECRET');
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    if (!secret && isProduction) {
      throw new Error('JWT_SECRET is not configured');
    }

    return secret ?? 'dev-access-secret';
  }

  private getRefreshTokenSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.getAccessTokenSecret()
    );
  }

  private hashRefreshToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private timingSafeHashEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private async compareWithDummyHash(password: string) {
    const dummyHash = await this.invalidPasswordHashPromise;
    await bcrypt.compare(password, dummyHash);
  }
}