import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbusePreventionController } from './abuse-prevention.controller';
import { AbusePreventionService } from './abuse-prevention.service';
import { AbuseFlag } from './entities/abuse-flag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AbuseFlag])],
  controllers: [AbusePreventionController],
  providers: [AbusePreventionService],
  exports: [AbusePreventionService],
})
export class AbusePreventionModule {}
