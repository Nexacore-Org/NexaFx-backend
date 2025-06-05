import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Blacklist } from './entities/blacklist.entity';
import { BlacklistService } from './blacklist.service'; 
import { BlacklistController } from './blacklist.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Blacklist])],
  providers: [BlacklistService],
  controllers: [BlacklistController],
  exports: [BlacklistService],
})
export class BlacklistModule {}
