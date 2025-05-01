import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateTransactionTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}