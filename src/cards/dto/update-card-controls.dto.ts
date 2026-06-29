import { IsOptional, IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCardControlsDto {
  @IsOptional()
  @IsString()
  spendLimit?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedMccs?: string[];
}
