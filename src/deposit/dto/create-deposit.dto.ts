import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Min,
  IsPositive,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DepositMethod } from '../enums/depositMethod.enum';

export class CreateDepositDto {
  @ApiProperty({
    description: 'Currency code for the deposit',
    example: 'USDC',
  })
  @IsNotEmpty()
  @IsString()
  currency: string;

  @ApiProperty({
    description: 'Amount to deposit',
    example: 100.5,
  })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Deposit method',
    enum: DepositMethod,
    example: DepositMethod.INSTANT,
  })
  @IsOptional()
  @IsEnum(DepositMethod)
  method?: DepositMethod;

  @ApiProperty({
    description: 'Payment reference or transaction hash',
    example: 'TXN_123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    description: 'Additional notes or description',
    example: 'Deposit from external wallet',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Source wallet address or account',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C87',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceAddress?: string;
}
