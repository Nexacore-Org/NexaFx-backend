import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.00000001)
  amount: number;
}
