import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusComponent } from './entities/status-component.entity';
import { StatusIncident } from './entities/status-incident.entity';
import { StatusService } from './status.service';
import { StatusPublicController, StatusAdminController } from './status.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StatusComponent, StatusIncident])],
  controllers: [StatusPublicController, StatusAdminController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
