import { IsNotEmpty, IsString, Length, IsOptional, IsEnum } from 'class-validator';
import { TransactionCategoryColor } from '../entities/transaction-category.entity';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsEnum(TransactionCategoryColor)
  color?: TransactionCategoryColor;
}
