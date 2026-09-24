import { Module } from '@nestjs/common';
import { SorobanIntegrationController } from './soroban-integration.controller';
import { SorobanIntegrationService } from './soroban-integration.service';

@Module({
  controllers: [SorobanIntegrationController],
  providers: [SorobanIntegrationService],
  exports: [SorobanIntegrationService],
})
export class SorobanIntegrationModule {}
