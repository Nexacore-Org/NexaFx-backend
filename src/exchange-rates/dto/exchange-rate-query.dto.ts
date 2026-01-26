import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class ExchangeRateQueryDto {
  @ApiProperty({
    example: 'NGN',
    description: 'Base currency code (ISO 4217)',
  })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  @Transform(({ value }) => String(value).toUpperCase())
  from: string;

  @ApiProperty({
    example: 'USD',
    description: 'Target currency code (ISO 4217)',
  })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  @Transform(({ value }) => String(value).toUpperCase())
  to: string;
}
