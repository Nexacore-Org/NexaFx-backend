import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ForensicsService } from './forensics.service';
import { ForensicsController } from './forensics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [ForensicsController],
  providers: [ForensicsService],
  exports: [ForensicsService],
})
export class ForensicsModule {}
