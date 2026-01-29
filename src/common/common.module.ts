import { Module, Global } from '@nestjs/common';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';
import { EncryptionService } from './services/encryption.service';

@Global()
@Module({
  providers: [PaginationService, DateService, EncryptionService],
  exports: [PaginationService, DateService, EncryptionService],
})
export class CommonModule {}
