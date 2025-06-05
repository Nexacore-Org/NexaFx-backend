import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsString,
  IsDateString,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class FilterTransactionsDto {
  @IsOptional()
  @IsEnum(['pending', 'completed', 'failed'])
  status?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  @IsNumber()
  page: number = 1;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  @IsNumber()
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
