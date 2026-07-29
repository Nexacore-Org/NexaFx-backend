import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoRestriction } from './entities/geo-restriction.entity';
import { GeoRestrictionsService } from './geo-restrictions.service';
import { GeoRestrictionsController } from './geo-restrictions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GeoRestriction])],
  controllers: [GeoRestrictionsController],
  providers: [GeoRestrictionsService],
  exports: [GeoRestrictionsService],
})
export class GeoRestrictionsModule {}
