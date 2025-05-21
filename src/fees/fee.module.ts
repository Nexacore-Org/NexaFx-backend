import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeService } from './fee.service';
import { FeeController } from './fee.controller';
import { AuthModule } from '../auth/auth.module';
import { FeeRule } from './entities/fee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeeRule]), AuthModule],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
