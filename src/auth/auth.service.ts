import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { OtpsService } from '../otps/otps.service';
import { OtpType } from '../otps/otp.entity';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpsService: OtpsService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly otpDeliveryService: OtpDeliveryService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    const genericMessage = 'If an account exists with this email, an OTP has been sent.';

    if (!user || !user.isVerified) {
      await this.simulateProcessingDelay();
      
      // Log failed login attempt
      await this.auditLogsService.logAuthEvent(
        undefined,
        AuditAction.FAILED_LOGIN,
        {
          email: loginDto.email,
          reason: 'User not found or not verified',
          ip: ipAddress,
          device: userAgent,
        }
      );
      
      return { message: genericMessage };
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    
    if (!isPasswordValid) {
      await this.simulateProcessingDelay();
      
      // Log failed login attempt
      await this.auditLogsService.logAuthEvent(
        undefined,
        AuditAction.FAILED_LOGIN,
        {
          email: loginDto.email,
          reason: 'Invalid password',
          ip: ipAddress,
          device: userAgent,
          userId: user.id,
        }
      );
      
      return { message: genericMessage };
    }

    const otp = await this.otpsService.generateOtp(user, OtpType.LOGIN);
    await this.otpDeliveryService.sendOtp({
      email: user.email,
      type: OtpType.LOGIN,
      otp,
    });

    // Log successful login OTP sent
    await this.auditLogsService.logAuthEvent(
      user.id,
      AuditAction.LOGIN,
      {
        method: 'email',
        status: 'otp_sent',
        ip: ipAddress,
        device: userAgent,
      }
    );

    return { message: genericMessage };
  }

  async verifyLoginOtp(verifyDto: VerifyLoginOtpDto, ipAddress?: string, userAgent?: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const user = await this.usersService.findByEmail(verifyDto.email);
    if (!user || !user.isVerified) {
      // Log failed OTP verification
      await this.auditLogsService.logAuthEvent(
        undefined,
        AuditAction.FAILED_LOGIN,
        {
          email: verifyDto.email,
          reason: 'Invalid credentials for OTP verification',
          ip: ipAddress,
          device: userAgent,
        }
      );
      
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.otpsService.validateOtp(user, verifyDto.otp, OtpType.LOGIN);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.refreshTokensService.createRefreshToken(
      user.id,
    );
    const expiresIn = this.getAccessTokenExpirySeconds();

    // Log successful login with OTP verification
    await this.auditLogsService.logAuthEvent(
      user.id,
      AuditAction.LOGIN,
      {
        method: 'email',
        status: 'success',
        ip: ipAddress,
        device: userAgent,
        hasOtp: true,
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  async forgotPassword(
    forgotDto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(forgotDto.email);
    const genericMessage = 'If an account exists with this email, password reset instructions have been sent.';

    if (!user || !user.isVerified) {
      await this.simulateProcessingDelay();
      return { message: genericMessage };
    }

    const otp = await this.otpsService.generateOtp(
      user,
      OtpType.PASSWORD_RESET,
    );
    await this.otpDeliveryService.sendOtp({
      email: user.email,
      type: OtpType.PASSWORD_RESET,
      otp,
    });

    // Log password reset request
    await this.auditLogsService.logAuthEvent(
      user.id,
      AuditAction.PASSWORD_RESET_REQUEST,
      {
        email: user.email,
        ip: ipAddress,
        device: userAgent,
      }
    );

    return { message: genericMessage };
  }

  async resetPassword(
    resetDto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(resetDto.email);
    if (!user || !user.isVerified) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.otpsService.validateOtp(
      user,
      resetDto.otp,
      OtpType.PASSWORD_RESET,
    );
    await this.usersService.updatePassword(user.id, resetDto.newPassword);
    await this.refreshTokensService.revokeAllUserTokens(user.id);
    await this.otpsService.invalidateAllUserOtps(user.id);

    // Log password reset completion
    await this.auditLogsService.logAuthEvent(
      user.id,
      AuditAction.PASSWORD_RESET_COMPLETE,
      {
        email: user.email,
        ip: ipAddress,
        device: userAgent,
      }
    );

    return {
      message: 'Password has been reset successfully. Please login with your new password.',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const tokenEntity = await this.refreshTokensService.validateRefreshToken(refreshToken);
    const user = await this.usersService.findById(tokenEntity.userId);

    if (!user || !user.isVerified) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.getAccessTokenExpirySeconds();

    return {
      accessToken,
      expiresIn,
    };
  }

  async logout(userId: string, tokenId?: string, ipAddress?: string, userAgent?: string): Promise<void> {
    // If you have a logout endpoint that invalidates refresh tokens
    if (tokenId) {
      await this.refreshTokensService.revokeRefreshToken(tokenId);
    }
    
    // Log logout action
    await this.auditLogsService.logAuthEvent(
      userId,
      AuditAction.LOGOUT,
      {
        tokenId,
        ip: ipAddress,
        device: userAgent,
      }
    );
  }

  async logoutAllDevices(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.refreshTokensService.revokeAllUserTokens(userId);
    
    // Log logout from all devices
    await this.auditLogsService.logAuthEvent(
      userId,
      AuditAction.LOGOUT,
      {
        scope: 'all_devices',
        ip: ipAddress,
        device: userAgent,
      }
    );
  }

  private getAccessTokenExpirySeconds(): number {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  private async simulateProcessingDelay(): Promise<void> {
    const delay = 50 + Math.random() * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

