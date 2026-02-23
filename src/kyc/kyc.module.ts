import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycRecord } from './entities/kyc.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KycRecord, User])],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
