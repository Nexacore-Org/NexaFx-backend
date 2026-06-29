import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignCategoryDto {
  @ApiProperty({ description: 'Transaction category UUID' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;
}
