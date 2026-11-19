import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class ExchangeRateQueryDto {
  @ApiProperty({
    example: 'NGN',
    description: 'Source currency code (2-10 uppercase letters or digits)',
  })
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/)
  @Transform(({ value }) => String(value).toUpperCase())
  from: string;

  @ApiProperty({
    example: 'USDC',
    description: 'Target currency code (2-10 uppercase letters or digits)',
  })
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/)
  @Transform(({ value }) => String(value).toUpperCase())
  to: string;
}
