import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Otp } from './otp.entity';
import { OtpsService } from './otps.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Otp]), UsersModule],
  providers: [OtpsService],
  exports: [OtpsService],
})
export class OtpsModule {}
