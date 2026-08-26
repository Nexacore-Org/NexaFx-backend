import { IsNotEmpty, IsString } from 'class-validator';

export class AssignCategoryDto {
  @IsNotEmpty()
  @IsString()
  transactionId: string;

  @IsNotEmpty()
  @IsString()
  categoryId: string;
}
