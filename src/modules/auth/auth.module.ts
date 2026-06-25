import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../../modules/users/entities/user.entity';
import { RedisModule } from '../redis/redis.module';
import { FraudModule } from '../fraud/fraud.module';
import { OtpsModule } from '../../otps/otps.module';
import { OtpDeliveryService } from '../../auth/email/otp-delivery.service';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PassportModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (!secret && isProduction) {
          throw new Error('JWT_SECRET is not configured');
        }

        return {
          secret: secret ?? 'dev-access-secret',
          signOptions: {
            expiresIn: '15m',
          },
        };
      },
      inject: [ConfigService],
    }),
    FraudModule,
    OtpsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OtpDeliveryService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
