import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVariantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  key: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  weight: number;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, any>;
}

export class CreateExperimentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  key: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  trafficPercent?: number;

  @ApiProperty({ type: [CreateVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
