import { PartialType } from '@nestjs/mapped-types';
import { CreateCurrencyDto } from './create-currency.dto';
import { IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCurrencyDto extends PartialType(CreateCurrencyDto) {
  @ApiPropertyOptional({ example: 1.0 })
  @IsOptional()
  @IsNumber()
  rate?: number;
}
