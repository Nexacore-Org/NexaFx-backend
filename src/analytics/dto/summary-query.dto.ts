import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { TransactionCategoryColor } from '../entities/transaction-category.entity';

export class SummaryQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
