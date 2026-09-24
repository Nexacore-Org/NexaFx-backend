import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MicroSavingsRule } from './entities/micro-savings-rule.entity';
import { MicroSavingsContribution } from './entities/micro-savings-contribution.entity';
import { MicroSavingsService } from './micro-savings.service';
import { MicroSavingsController } from './micro-savings.controller';
import { VaultsModule } from '../../vaults/vaults.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MicroSavingsRule, MicroSavingsContribution]),
    VaultsModule,
    UsersModule,
  ],
  controllers: [MicroSavingsController],
  providers: [MicroSavingsService],
  exports: [MicroSavingsService],
})
export class MicroSavingsModule {}
