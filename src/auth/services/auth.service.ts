import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/providers/user.service';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Otp } from 'src/user/entities/otp.entity';
import { PasswordHashingService } from './passwod.hashing.service';
import { MailService } from 'src/mail/mail.service';
import { LoginDto } from '../dto/login.dto';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { InitiateSignupDto } from '../dto/initiate-signup.dto';
import { VerifySignupDto } from '../dto/verify-signup.dto';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from 'src/activity-log/providers/activity-log.service';
import { Token } from '../entities/token.entity';

type userDetails = {
  email: string;
  phone: string;
  password: string; // Store hashed password
  otp: string;
  expiresAt: number;
};
// In-memory cache for demo; replace with Redis in production
const signupCache = new Map<string, userDetails>();
const otpAttempts = new Map<string, number>();

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordHashingService,
    private readonly emailService: MailService,
    private readonly configService: ConfigService,
    private readonly activityLogService: ActivityLogService,
    @InjectRepository(Otp) private otpRepo: Repository<Otp>,
    @InjectRepository(Token) private tokenRepo: Repository<Token>,
  ) {}

  // Validate User Credentials (supports both email and phone)
  public async validateUser(
    identifier: string,
    password: string,
  ): Promise<User> {
    try {
      // Check if identifier is email or phone number
      const isEmail = identifier.includes('@');

      let user: User;
      if (isEmail) {
        user = await this.usersService.findOneByEmail(identifier);
      } else {
        user = await this.usersService.findOneByPhone(identifier);
      }

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user) {
        console.log(
          'LOGIN DEBUG: Existing user password hash in DB:',
          user.password,
        );
      }

      // Check if password is not hashed (this shouldn't happen in production)
      if (
        !user.password.startsWith('$2b') &&
        !user.password.startsWith('$2a')
      ) {
        console.error('WARNING: Password in database is not hashed!');
        throw new UnauthorizedException('Invalid credentials - security issue');
      }

      const isValidPassword = await this.passwordService.comparePassword(
        password,
        user.password,
      );

      console.log('Password validation result:', isValidPassword);
      console.log('=== END DEBUG ===');

      if (!isValidPassword) {
        throw new UnauthorizedException(
          'Invalid credentials - password mismatch',
        );
      }

      return user;
    } catch (error) {
      console.error('Validation error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  // Step 1: Initial login - validate credentials and send OTP
  public async initiateLogin(loginDto: LoginDto, request?: Request) {
    try {
      // Validate user credentials
      const user = await this.validateUser(
        loginDto.identifier,
        loginDto.password,
      );

      // Generate and send OTP
      const otp = this.generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      // Store OTP in database
      await this.otpRepo.save({
        email: user.email,
        code: otp,
        expiresAt,
      });

      // Send OTP via email (you can modify this to send via SMS for phone numbers)
      await this.emailService.sendOtpEmail({
        to: user.email,
        otp,
        userName: `${user.firstName} ${user.lastName}, ${user.email} `,
        expirationMinutes: 10,
      });

      // Log login attempt
      if (request) {
        await this.activityLogService.logLoginActivity(
          user.id,
          request,
          undefined,
          {
            loginMethod: 'OTP_INITIATE',
            otpSent: true,
            step: 'INITIATE',
          },
        );
      }

      return {
        message: 'OTP sent successfully',
        email: user.email, // Return email for OTP verification step
        requiresOtp: true,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Login initiation failed');
    }
  }

  // Step 2: Verify OTP and complete login
  public async completeLogin(
    email: string,
    otpCode: string,
    response: Response,
    request?: Request,
  ) {
    try {
      // Verify OTP
      const isOtpValid = await this.verifyOtp(email, otpCode);

      if (!isOtpValid) {
        // Log failed OTP attempt
        if (request) {
          const user = await this.usersService.findOneByEmail(email);
          if (user) {
            await this.activityLogService.logLoginActivity(
              user.id,
              request,
              undefined,
              {
                loginMethod: 'OTP_VERIFY',
                otpVerified: false,
                step: 'VERIFY_FAILED',
              },
            );
          }
        }
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      // Get user details
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Generate tokens
      const tokens = this.generateTokens(user, sessionId);

      // Set tokens as HTTP-only cookies
      this.setTokenCookies(response, tokens);

      // Update user's last login and refresh token in database
      await this.usersService.update(user.id, { lastLogin: new Date() });
      await this.saveRefreshToken(user, tokens.refreshToken, sessionId);

      // Log successful login
      if (request) {
        await this.activityLogService.logLoginActivity(
          user.id,
          request,
          sessionId,
          {
            loginMethod: '2FA',
            otpVerified: true,
            step: 'COMPLETE',
            sessionId,
          },
        );

        // Check for suspicious activity
        const ipAddress = this.extractIpAddress(request);
        const isSuspicious =
          await this.activityLogService.checkSuspiciousActivity(
            user.id,
            ipAddress,
          );

        if (isSuspicious) {
          // Send security alert email (if you have this method)
          // await this.emailService.sendSecurityAlert(
          //   user.email,
          //   user.firstName,
          //   ipAddress,
          //   request.headers['user-agent'] || 'Unknown',
          // );
        }
      }

      return {
        message: 'Login successful',
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phoneNumber,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          pics: user.profilePicture,
          address: user.address,
          // Add other user fields you want to return
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Login completion failed');
    }
  }

  // Generate both access and refresh tokens
  private generateTokens(user: User, sessionId?: string) {
    const payload = {
      email: user.email,
      sub: user.id,
      sessionId: sessionId || uuidv4(),
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_ACCESS_TOKEN_TTL') || '15m',
      }),
      refreshToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_REFRESH_TOKEN_TTL') || '7d',
        secret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      }),
    };
  }

  // Set tokens as HTTP-only cookies
  private setTokenCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    // Set only refresh token as HTTP-only cookie
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  // Update user's login information in database
  private async updateUserLoginInfo(userId: string, refreshToken: string) {
    try {
      // Hash the refresh token before storing
      const hashedRefreshToken =
        await this.passwordService.hashPassword(refreshToken);

      // Update user's refresh token and last login
      await this.usersService.updateUserLoginInfo(userId, {
        refreshToken: hashedRefreshToken,
        lastLogin: new Date(),
      });
    } catch (error) {
      console.error('Error updating user login info:', error);
      // Don't throw error here to avoid breaking the login flow
    }
  }

  // Refresh Token Method
  public async refreshToken(
    token: string,
    response: Response,
    request?: Request,
  ) {
    try {
      const decoded = this.jwtService.verify<{
        email: string;
        sub: number;
        sessionId: string;
      }>(token, {
        secret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      });

      const user = await this.usersService.findOne(decoded.email);
      if (!user || !user.tokens?.[0]?.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify the refresh token against the stored hash
      const isValidRefreshToken = await this.passwordService.comparePassword(
        token,
        user.tokens[0].refreshToken,
      );
      if (!isValidRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = this.generateTokens(user, decoded.sessionId);

      // Set new tokens as cookies
      this.setTokenCookies(response, tokens);

      // Update stored refresh token
      await this.updateUserLoginInfo(user.id, tokens.refreshToken);

      // Log token refresh activity
      if (request) {
        await this.activityLogService.logLoginActivity(
          user.id,
          request,
          decoded.sessionId,
          {
            loginMethod: 'TOKEN_REFRESH',
            tokenRefreshed: true,
            sessionId: decoded.sessionId,
          },
        );
      }

      return {
        message: 'Tokens refreshed successfully',
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // Request OTP (for other purposes, keeping your existing method)
  public async requestOtp(email: string) {
    try {
      const user = await this.usersService.findOneByEmail(email);
      if (!user) throw new ConflictException('User does not exist');

      const otp = this.generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await this.otpRepo.save({ email, code: otp, expiresAt });

      await this.emailService.sendOtpEmail({
        to: email,
        otp,
        userName: `${user.firstName} ${user.lastName}`,
        expirationMinutes: 10,
      });

      return { message: 'OTP sent successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to generate and send OTP');
    }
  }

  // Verify OTP
  async verifyOtp(email: string, code: string): Promise<boolean> {
    try {
      const record = await this.otpRepo.findOneBy({ email, code });

      if (!record) {
        return false; // OTP not found
      }

      const isExpired = record.expiresAt.getTime() < Date.now();

      if (isExpired) {
        await this.otpRepo.delete({ email, code }); // cleanup
        return false; // OTP expired
      }

      await this.otpRepo.delete({ email, code }); // one-time use
      return true;
    } catch (error) {
      console.error('Error verifying OTP:', error);
      throw new InternalServerErrorException(
        'Could not verify OTP at this time.',
      );
    }
  }

  // Logout - clear cookies and log activity
  public async logout(response: Response, request?: Request) {
    // Log logout activity
    if (request && request.user) {
      const userId = request.user['id'];
      const sessionId = request.user['sessionId'];
      await this.activityLogService.logLogoutActivity(
        userId,
        sessionId,
        request,
      );
    }

    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    return { message: 'Logged out successfully' };
  }

  // Generate OTP
  private generateOtp(): string {
    return String(randomInt(100000, 999999));
  }

  // Extract IP address from request
  private extractIpAddress(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    const realIp = request.headers['x-real-ip'] as string;
    const remoteAddress =
      request.connection?.remoteAddress || request.socket?.remoteAddress;

    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    if (realIp) {
      return realIp;
    }
    return remoteAddress || 'Unknown';
  }

  // Legacy methods (keeping for backward compatibility)
  generateAccessToken(user: User): string {
    return this.jwtService.sign({ sub: user.id }, { expiresIn: '1h' });
  }

  generateRefreshToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '3d', secret: process.env.REFRESH_TOKEN_SECRET },
    );
  }

  async storeRefreshToken(userId: string, token: string) {
    const hash = await this.passwordService.hashPassword(token);
    await this.usersService.updateRefreshToken(userId, hash);
  }

  // Initiate secure sign-up
  async initiateSignup(dto: InitiateSignupDto) {
    // Validate input data
    if (!dto.email || !dto.phone || !dto.password) {
      throw new BadRequestException('Email, phone, and password are required');
    }

    try {
      // Check if user already exists by email or phone
      const existingByEmail = await this.usersService.findOneByEmailOptional(
        dto.email,
      );
      if (existingByEmail) {
        throw new ConflictException('Email already exists');
      }

      const existingByPhone = await this.usersService.findOneByPhoneOptional(
        dto.phone,
      );
      if (existingByPhone) {
        throw new ConflictException('Phone number already exists');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(dto.email)) {
        throw new BadRequestException('Invalid email format');
      }

      // Validate password strength
      if (dto.password.length < 8) {
        throw new BadRequestException(
          'Password must be at least 8 characters long',
        );
      }

      // Generate OTP
      const otp = this.generateOtp();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Hash password immediately for security
      const hashedPassword = await this.passwordService.hashPassword(
        dto.password,
      );

      // Store hashed password in cache
      try {
        signupCache.set(dto.email, {
          email: dto.email,
          phone: dto.phone,
          password: hashedPassword, // Store hashed password
          otp,
          expiresAt,
        });
        otpAttempts.set(dto.email, 0);
      } catch (error) {
        console.error('error', error);
        throw new InternalServerErrorException('Failed to store signup data');
      }
      // Send OTP via email
      try {
        await this.emailService.sendOtpEmail({
          to: dto.email,
          otp,
          userName: dto.email,
          expirationMinutes: 10,
        });
      } catch (error) {
        console.error('error', error);

        // Clean up cache if email sending fails
        signupCache.delete(dto.email);
        otpAttempts.delete(dto.email);
        throw new InternalServerErrorException('Failed to send OTP email');
      }

      return {
        message: 'OTP sent to email successfully',
        email: dto.email,
        expiresIn: '10 minutes',
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'An unexpected error occurred during signup',
      );
    }
  }

  // Verify OTP and create user with tokens
  async verifySignup(
    dto: VerifySignupDto,
    response?: Response,
    request?: Request,
  ) {
    try {
      const cached = signupCache.get(dto.email);
      if (!cached) {
        throw new UnauthorizedException('No signup in progress or OTP expired');
      }

      // Check expiry
      if (Date.now() > cached.expiresAt) {
        signupCache.delete(dto.email);
        otpAttempts.delete(dto.email);
        throw new HttpException('OTP expired', HttpStatus.BAD_REQUEST);
      }

      // Check attempts
      const attempts = otpAttempts.get(dto.email) || 0;
      if (attempts >= 3) {
        signupCache.delete(dto.email);
        otpAttempts.delete(dto.email);
        throw new UnauthorizedException('Too many OTP attempts');
      }

      // Validate OTP
      if (dto.otp !== cached.otp) {
        otpAttempts.set(dto.email, attempts + 1);
        // Log failed OTP attempt
        if (request) {
          await this.activityLogService.logActivity(
            null,
            request,
            'SIGNUP_OTP_FAILED',
            {
              email: dto.email,
              attempts: attempts + 1,
            },
          );
        }
        throw new UnauthorizedException('Invalid OTP');
      }
      console.log(
        'VERIFY SIGNUP: Cached password (already hashed):',
        cached.password,
      );
      // Create user with already hashed password
      const user = await this.usersService.create({
        email: cached.email,
        phoneNumber: cached.phone,
        password: cached.password,
      });

      // Set isVerified = true after creation
      user.isVerified = true;
      await this.usersService.update(user.id, {
        isVerified: true,
      });

      // Generate tokens
      const tokens = this.generateTokens(user);

      // If response object is provided, set cookies
      if (response) {
        response.cookie('refresh_token', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Log successful signup
      if (request) {
        await this.activityLogService.logLoginActivity(
          user.id,
          request,
          sessionId,
          {
            loginMethod: 'SIGNUP',
            accountCreated: true,
            otpVerified: true,
            sessionId,
          },
        );
      }

      await this.saveRefreshToken(user, tokens.refreshToken, sessionId);

      // Cleanup cache
      signupCache.delete(dto.email);
      otpAttempts.delete(dto.email);

      return {
        message: 'User created successfully',
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phoneNumber,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          pics: user.profilePicture,
          address: user.address,
        },
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Signup verification failed');
    }
  }

  private async saveRefreshToken(user: User, token: string, sessionId: string) {
    const hashedRefreshToken = await this.passwordService.hashPassword(token);

    // Calculate the new expiration date
    const refreshTokenTtl: string =
      (this.configService.get<string>('JWT_REFRESH_TOKEN_TTL') as string) ||
      '7d';
    const expiresInDays = parseInt(refreshTokenTtl, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Check if a token for this session already exists
    const existingToken = await this.tokenRepo.findOneBy({
      user: { id: user.id },
      sessionId: sessionId,
    });

    if (existingToken) {
      // If it exists, UPDATE it with the new hash and expiration
      existingToken.refreshToken = hashedRefreshToken;
      existingToken.expiresAt = expiresAt;
      await this.tokenRepo.save(existingToken);
    } else {
      // If it does not exist, CREATE a new one
      const newToken = this.tokenRepo.create({
        refreshToken: hashedRefreshToken,
        user,
        expiresAt,
        sessionId,
      });
      await this.tokenRepo.save(newToken);
    }
  }
}
