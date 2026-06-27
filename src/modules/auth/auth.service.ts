import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuthAccount, OAuthProvider } from '../entities/oauth-account.entity';
import { ConfigService } from '@nestjs/config';
import { WalletsService } from '../../wallets/wallets.service';
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
import { RedisService } from '../redis/redis.service';

type AuthUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'role'
  | 'password'
  | 'passwordHash'
  | 'isActive'
>;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(OAuthAccount) private readonly oauthAccountRepository: Repository<OAuthAccount>,
    private readonly configService: ConfigService,
    private readonly walletsService: WalletsService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}
  private readonly bcryptRounds = 12;
  private readonly accessTokenExpiresIn = '15m';
  private readonly refreshTokenExpiresIn = '7d';
  private readonly invalidPasswordHashPromise = bcrypt.hash(
    '__invalid_password__',
    12,
  );



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
    const decoded = this.decodeRefreshToken(refreshTokenDto.refreshToken);
    await this.assertRefreshTokenInRedis(refreshTokenDto.refreshToken, decoded);

    const payload = await this.verifyRefreshToken(refreshTokenDto.refreshToken);
    const user = await this.findAuthUserById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: await this.signAccessToken(user),
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const decoded = this.decodeRefreshToken(refreshToken);
      if (decoded.sub === userId && decoded.jti) {
        await this.redisService.delete(
          this.redisService.refreshTokenKey(userId, decoded.jti),
        );
      }
    } else {
      await this.redisService.deleteByPattern(
        this.redisService.refreshTokenKey(userId, '*'),
      );
    }

    return { message: 'Logged out successfully' };
  }

  private async issueTokenPair(user: AuthUser) {
    const accessToken = await this.signAccessToken(user);
    const tokenId = crypto.randomUUID();
    const refreshToken = await this.signRefreshToken(user, tokenId);

    const refreshKey = this.redisService.refreshTokenKey(user.id, tokenId);
    await this.redisService.setString(
      refreshKey,
      this.hashRefreshToken(refreshToken),
      7 * 24 * 60 * 60,
    );

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

  private async signRefreshToken(
    user: Pick<AuthUser, 'id' | 'email' | 'role'>,
    tokenId: string,
  ) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      } satisfies JwtPayload,
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.refreshTokenExpiresIn,
        jwtid: tokenId,
      },
    );
  }

  private async assertRefreshTokenInRedis(token: string, payload: JwtPayload) {
    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const redisKey = this.redisService.refreshTokenKey(payload.sub, payload.jti);
    const storedHash = await this.redisService.getString(redisKey);

    // null  → Redis unavailable → fail closed (401)
    // empty → key missing → token was invalidated (logout) → 401
    if (!storedHash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const presentedHash = this.hashToken(token);
    if (!this.timingSafeEquals(storedHash, presentedHash)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private decodeRefreshToken(token: string): JwtPayload {
    const decoded = this.jwtService.decode(token);
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.sub !== 'string'
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return decoded as JwtPayload;
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
        isActive: true,
      },
    });
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
        isActive: true,
      },
    });
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private normalizeOptionalName(value?: string) {
    return value?.trim() || '';
  }

  private getAccessTokenSecret() {
    const secret = this.configService.get<string>('JWT_SECRET');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

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
  async handleOAuthLogin(
    provider: OAuthProvider,
    providerAccountId: string,
    email?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Find existing OAuth link
    const existing = await this.oauthAccountRepository.findOne({
      where: { provider, providerAccountId },
    });

    if (existing) {
      const user = await this.userRepository.findOne({
        where: { id: existing.userId },
        select: { id: true, email: true, role: true, password: true, passwordHash: true, isActive: true },
      });
      if (!user) {
        throw new ConflictException('Linked user not found');
      }
      return this.issueTokenPair(user);
    }

    // No existing link; create or find user by email
    if (!email) {
      throw new ConflictException('Email is required for new OAuth user');
    }
    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, this.bcryptRounds);
      user = this.userRepository.create({
        email,
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        password: passwordHash,
        passwordHash,
        role: UserRole.USER,
        isVerified: true,
        isEmailVerified: true,
        isActive: true,
      });
      user = await this.userRepository.save(user);
      await this.walletsService.provisionWallet(user.id);
    }

    const oauthAccount = this.oauthAccountRepository.create({
      provider,
      providerAccountId,
      userId: user.id,
    });
    await this.oauthAccountRepository.save(oauthAccount);

    return this.issueTokenPair(user);
  }
}

