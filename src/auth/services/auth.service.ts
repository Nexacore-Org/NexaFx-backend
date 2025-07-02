import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  HttpStatus,
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
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InitiateSignupDto } from '../dto/initiate-signup.dto';
import { VerifySignupDto } from '../dto/verify-signup.dto';
import * as bcrypt from 'bcrypt';

// In-memory cache for demo; replace with Redis in production
const signupCache = new Map();
const otpAttempts = new Map();

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordHashingService,
    private readonly emailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(Otp)
    private otpRepo: Repository<Otp>,
  ) {}

  // Validate User Credentials (supports both email and phone)
  public async validateUser(
    identifier: string,
    password: string,
  ): Promise<User> {
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

    const isValidPassword = await this.passwordService.comparePassword(
      password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  // Step 1: Initial login - validate credentials and send OTP
  public async initiateLogin(loginDto: LoginDto) {
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
        userName: `${user.firstName} ${user.lastName}`,
        expirationMinutes: 10,
      });

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
  ) {
    try {
      // Verify OTP
      const isOtpValid = await this.verifyOtp(email, otpCode);

      if (!isOtpValid) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      // Get user details
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Set tokens as HTTP-only cookies
      this.setTokenCookies(response, tokens);

      // Update user's last login and refresh token in database
      await this.updateUserLoginInfo(user.id, tokens.refreshToken);

      return {
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phoneNumber,
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
  private generateTokens(user: User) {
    const payload = { email: user.email, sub: user.id };

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

    // Send access token in JSON response
    response.status(200).json({
      message: 'Login successful',
      accessToken: tokens.accessToken,
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
  public async refreshToken(token: string, response: Response) {
    try {
      const decoded = this.jwtService.verify<{ email: string; sub: number }>(
        token,
        { secret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET },
      );

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
      const tokens = this.generateTokens(user);

      // Set new tokens as cookies
      this.setTokenCookies(response, tokens);

      // Update stored refresh token
      await this.updateUserLoginInfo(user.id, tokens.refreshToken);

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

  // Logout - clear cookies
  public logout(response: Response) {
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
    // Check if user already exists
    const existing = await this.usersService.findOneByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }
    // Generate OTP
    const otp = this.generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    // Hash password now for security
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    // Store in cache
    signupCache.set(dto.email, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: hashedPassword,
      accountType: dto.accountType,
      otp,
      expiresAt,
    });
    otpAttempts.set(dto.email, 0);
    // Send OTP via email
    await this.emailService.sendOtpEmail({
      to: dto.email,
      otp,
      userName: dto.email,
      expirationMinutes: 10,
    });
    return { message: 'OTP sent to email', email: dto.email };
  }

  // Verify OTP and create user
  async verifySignup(dto: VerifySignupDto) {
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
      throw new UnauthorizedException('Invalid OTP');
    }
    // Create user
    const user = await this.usersService.create({
      firstName: cached.firstName,
      lastName: cached.lastName,
      email: cached.email,
      phoneNumber: cached.phone,
      password: cached.password,
      accountType: cached.accountType,
    });
    // Set isVerified = true after creation
    user.isVerified = true;
    await this.usersService.update(user.id, user);
    // Cleanup
    signupCache.delete(dto.email);
    otpAttempts.delete(dto.email);
    return { message: 'User created successfully', userId: user.id };
  }
}
