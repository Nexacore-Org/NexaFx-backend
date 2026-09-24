import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminBulkController } from './admin-bulk.controller';
import { AdminBulkService } from './admin-bulk.service';
import { BulkAction } from './entities/bulk-action.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BulkAction])],
  controllers: [AdminBulkController],
  providers: [AdminBulkService],
  exports: [AdminBulkService],
})
export class AdminBulkModule {}
