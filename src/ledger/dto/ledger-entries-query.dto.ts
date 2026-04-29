import { IsOptional, IsUUID } from 'class-validator';

export class LedgerEntriesQueryDto {
  @IsOptional()
  @IsUUID()
  transactionId?: string;
}