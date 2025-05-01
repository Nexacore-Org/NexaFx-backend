// src/transaction-tags/dto/create-transaction-tag.dto.ts
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateTransactionTagDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}