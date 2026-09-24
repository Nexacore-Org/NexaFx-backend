import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardPreferencesController } from './dashboard-preferences.controller';
import { DashboardPreferencesService } from './dashboard-preferences.service';
import { DashboardPreference } from './entities/dashboard-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DashboardPreference])],
  controllers: [DashboardPreferencesController],
  providers: [DashboardPreferencesService],
  exports: [DashboardPreferencesService],
})
export class DashboardPreferencesModule {}