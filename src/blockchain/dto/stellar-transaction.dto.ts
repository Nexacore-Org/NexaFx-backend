import { IsString, IsOptional, IsNumber, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StellarTransactionDto {
  @ApiProperty({
    description: 'Destination Stellar address',
    example: 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, { 
    message: 'Destination address must be a valid Stellar public key (starts with G and 56 characters long)' 
  })
  destinationAddress: string;

  @ApiProperty({
    description: 'Amount to send',
    example: '100.50',
  })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    description: "Asset to send (XLM for native token or 'CODE:ISSUER' format for other assets)",
    example: 'XLM',
  })
  @IsString()
  @IsNotEmpty()
  asset: string;

  @ApiPropertyOptional({
    description: 'Optional transaction memo',
    example: 'Payment for services',
  })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({
    description: 'Transaction timeout in seconds (default: 180)',
    example: 300,
  })
  @IsNumber()
  @IsOptional()
  timeout?: number;
}

export class StellarAccountDto {
  @ApiProperty({
    description: 'Stellar account address',
    example: 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, { 
    message: 'Address must be a valid Stellar public key (starts with G and 56 characters long)' 
  })
  address: string;
}