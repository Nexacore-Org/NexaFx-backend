import { Module } from '@nestjs/common';
import { ZeroDowntimeDeploymentController } from './zero-downtime-deployment.controller';
import { ZeroDowntimeDeploymentService } from './zero-downtime-deployment.service';

@Module({
  controllers: [ZeroDowntimeDeploymentController],
  providers: [ZeroDowntimeDeploymentService],
  exports: [ZeroDowntimeDeploymentService],
})
export class ZeroDowntimeDeploymentModule {}
