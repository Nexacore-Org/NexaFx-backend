import { Module } from '@nestjs/common';
import { DashboardPreferencesController } from './dashboard-preferences.controller';
import { DashboardPreferencesService } from './dashboard-preferences.service';

@Module({
  controllers: [DashboardPreferencesController],
  providers: [DashboardPreferencesService],
  exports: [DashboardPreferencesService],
})
export class DashboardPreferencesModule {}
