import { Module } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';

@Module({
  providers: [AdminGuard],
  exports: [AdminGuard],
})
export class CommonModule {}