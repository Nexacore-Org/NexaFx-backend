import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { BeneficiaryNetwork } from '../entities/beneficiary.entity';
import { IsStellarPublicKey } from '../../common/decorators/is-stellar-public-key.decorator';

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
  walletAddress: string;

  @ValidateIf(
    (dto: CreateBeneficiaryDto) => dto.network !== BeneficiaryNetwork.OTHER,
  )
  @IsStellarPublicKey()
  get stellarWalletAddressForValidation(): string {
    return this.walletAddress;
  }

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
