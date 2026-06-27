import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthAccount } from './entities/oauth-account.entity';

import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { User } from '../../modules/users/entities/user.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PassportModule,
    TypeOrmModule.forFeature([User, OAuthAccount]),
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
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, GithubStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
