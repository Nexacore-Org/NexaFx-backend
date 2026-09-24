import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsEnum, Min, IsNotEmpty } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ example: 10000, description: 'Amount to deposit' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'NGN', description: 'Currency code (NGN or USD)' })
  @IsString()
  @IsEnum(['NGN', 'USD'])
  currency: string;
}

export class CreateWithdrawalDto {
  @ApiProperty({ example: 5000, description: 'Amount to withdraw' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'NGN', description: 'Currency code (NGN or USD)' })
  @IsString()
  @IsEnum(['NGN', 'USD'])
  currency: string;

  @ApiProperty({ example: '044', description: 'Bank code' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Account number' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}

export class VerifyBankAccountDto {
  @ApiProperty({ example: '044', description: 'Bank code' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Account number' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}
