import { IsString, IsOptional, MaxLength, MinLength, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganisationDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  txLimitPerDay?: number;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  txLimitPerTx?: number;
}
