import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VolumeFeeTiersController } from './volume-fee-tiers.controller';
import { VolumeFeeTiersService } from './volume-fee-tiers.service';
import { VolumeFeeTier } from './entities/volume-fee-tier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VolumeFeeTier])],
  controllers: [VolumeFeeTiersController],
  providers: [VolumeFeeTiersService],
  exports: [VolumeFeeTiersService],
})
export class VolumeFeeTiersModule {}
