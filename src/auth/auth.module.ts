import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Token } from './entities/token.entity';
import { AuthService } from './services/auth.service';
import { UserModule } from 'src/user/user.module';
import { PasswordHashingService } from './services/passwod.hashing.service';
import { BcryptPasswordHashingService } from './services/bcrypt-password-hashing.service';
import { MailModule } from 'src/mail/mail.module';
import { Otp } from 'src/user/entities/otp.entity';
import { JwtStrategy } from 'src/common/jwt/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Token, Otp]),
    PassportModule,
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    MailModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: PasswordHashingService,
      useClass: BcryptPasswordHashingService,
    },
  ],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
