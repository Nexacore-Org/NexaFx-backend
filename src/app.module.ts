import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { MaintenanceGuard } from './super-admin/guards/maintenance.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SuperAdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
  ],
})
export class AppModule {}
