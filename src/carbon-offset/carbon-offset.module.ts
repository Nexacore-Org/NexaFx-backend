import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarbonOffsetController } from './carbon-offset.controller';
import { CarbonOffsetService } from './carbon-offset.service';
import { CarbonOffsetRecord } from './entities/carbon-offset-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CarbonOffsetRecord])],
  controllers: [CarbonOffsetController],
  providers: [CarbonOffsetService],
  exports: [CarbonOffsetService],
})
export class CarbonOffsetModule {}
