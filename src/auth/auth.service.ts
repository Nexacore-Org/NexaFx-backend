import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { OtpsService } from '../otps/otps.service';
import { OtpType } from '../otps/otp.entity';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifySignupOtpDto } from './dto/verify-signup-otp.dto';
import { VerifySignupResponseDto } from './dto/signup-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpsService: OtpsService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly otpDeliveryService: OtpDeliveryService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    const genericMessage =
      'If an account exists with this email, an OTP has been sent.';

    if (!user || !user.isVerified) {
      await this.simulateProcessingDelay();
      return { message: genericMessage };
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      await this.simulateProcessingDelay();
      return { message: genericMessage };
    }

    const otp = await this.otpsService.generateOtp(user, OtpType.LOGIN);
    await this.otpDeliveryService.sendOtp({
      email: user.email,
      type: OtpType.LOGIN,
      otp,
    });

    return { message: genericMessage };
  }

  async verifyLoginOtp(verifyDto: VerifyLoginOtpDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const user = await this.usersService.findByEmail(verifyDto.email);
    if (!user || !user.isVerified) {
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

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  async forgotPassword(
    forgotDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(forgotDto.email);
    const genericMessage =
      'If an account exists with this email, password reset instructions have been sent.';

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

    return { message: genericMessage };
  }

  async resetPassword(
    resetDto: ResetPasswordDto,
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

    return {
      message:
        'Password has been reset successfully. Please login with your new password.',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const tokenEntity =
      await this.refreshTokensService.validateRefreshToken(refreshToken);
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

  async signup(signupDto: SignupDto): Promise<{ message: string }> {
    const normalizedEmail = signupDto.email.toLowerCase().trim();
    const genericMessage =
      'If this email is available, a verification code has been sent.';

    // Check if email already exists
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      if (existingUser.isVerified) {
        // Email already registered and verified - return generic message to prevent enumeration
        await this.simulateProcessingDelay();
        return { message: genericMessage };
      } else {
        // Unverified user exists - delete and allow re-signup
        await this.usersService.deleteById(existingUser.id);
      }
    }

    // Check phone uniqueness if provided
    if (signupDto.phone) {
      const existingPhone = await this.usersService.findByPhone(signupDto.phone);
      if (existingPhone) {
        throw new ConflictException('Phone number is already registered');
      }
    }

    // Generate Stellar wallet using blockchain module
    const wallet = this.stellarService.generateWallet();

    // Encrypt the secret key
    const encryptedSecretKey = this.encryptionService.encrypt(wallet.secretKey);

    // Create user with wallet
    const user = await this.usersService.createUser({
      email: normalizedEmail,
      password: signupDto.password,
      firstName: signupDto.firstName,
      lastName: signupDto.lastName,
      phone: signupDto.phone,
      walletPublicKey: wallet.publicKey,
      walletSecretKeyEncrypted: encryptedSecretKey,
    });

    // Generate and send OTP
    const fullUser = await this.usersService.findById(user.id);
    if (fullUser) {
      const otp = await this.otpsService.generateOtp(fullUser, OtpType.SIGNUP);
      await this.otpDeliveryService.sendOtp({
        email: fullUser.email,
        type: OtpType.SIGNUP,
        otp,
      });
    }

    return { message: genericMessage };
  }

  async verifySignupOtp(
    verifyDto: VerifySignupOtpDto,
  ): Promise<VerifySignupResponseDto> {
    const user = await this.usersService.findByEmail(verifyDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    // Validate OTP
    await this.otpsService.validateOtp(user, verifyDto.otp, OtpType.SIGNUP);

    // Mark user as verified
    await this.usersService.verifyUser(user.id);

    // Generate tokens
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

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        isVerified: true,
        role: user.role,
        walletPublicKey: user.walletPublicKey,
        createdAt: user.createdAt,
      },
    };
  }

  async resendSignupOtp(email: string): Promise<{ message: string }> {
    const genericMessage =
      'If a pending signup exists, a new verification code has been sent.';

    const user = await this.usersService.findByEmail(email);

    if (!user || user.isVerified) {
      await this.simulateProcessingDelay();
      return { message: genericMessage };
    }

    // Generate and send new OTP
    const otp = await this.otpsService.generateOtp(user, OtpType.SIGNUP);
    await this.otpDeliveryService.sendOtp({
      email: user.email,
      type: OtpType.SIGNUP,
      otp,
    });

    return { message: genericMessage };
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
