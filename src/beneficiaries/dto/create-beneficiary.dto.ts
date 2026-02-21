import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { BeneficiaryNetwork } from '../entities/beneficiary.entity';

export class CreateBeneficiaryDto {
  @ApiProperty({ example: 'My Binance Wallet' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  nickname: string;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, {
    message:
      'walletAddress must be a valid Stellar public key (starts with G, 56 chars)',
  })
  walletAddress: string;

  @ApiProperty({ example: 'USDC' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  currency: string;

  @ApiPropertyOptional({
    enum: BeneficiaryNetwork,
    default: BeneficiaryNetwork.STELLAR,
  })
  @IsEnum(BeneficiaryNetwork)
  @IsOptional()
  network?: BeneficiaryNetwork;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
