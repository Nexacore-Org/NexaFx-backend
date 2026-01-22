import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { UsersModule } from '../users/users.module';
import { OtpsModule } from '../otps/otps.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    UsersModule,
    OtpsModule,
    TokensModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (!secret && isProduction) {
          throw new Error('JWT_SECRET must be set in production environment');
        }

        return {
          secret: secret || 'default-secret-change-in-production',
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '15m',
          },
        } as any;
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OtpDeliveryService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
