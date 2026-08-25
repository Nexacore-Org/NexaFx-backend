import { IsString, IsNotEmpty, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Groceries', description: 'Category name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: '🛒', description: 'Emoji or icon key' })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  icon?: string;

  @ApiPropertyOptional({ example: '#10b981', description: 'Hex color code' })
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color must be a valid hex code (e.g. #10b981)' })
  color?: string;
}
