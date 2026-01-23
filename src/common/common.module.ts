import { Module, Global } from '@nestjs/common';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';

@Global()
@Module({
  providers: [PaginationService, DateService],
  exports: [PaginationService, DateService],
})
export class CommonModule {}
