import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FlagsService } from './flags.service';
import { FlagsController } from './flags.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag]), CacheModule.register()],
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
