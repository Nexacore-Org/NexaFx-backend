import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsStellarPublicKey } from '../../common/decorators/is-stellar-public-key.decorator';

export class GenerateWalletDto {
  @ApiPropertyOptional({
    example: 'Trading',
    description: 'Optional label for the new wallet',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class ImportWalletDto {
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description: 'Stellar public key (watch-only)',
  })
  @IsString()
  @IsNotEmpty()
  @Length(56, 56)
  @IsStellarPublicKey()
  publicKey: string;

  @ApiPropertyOptional({ example: 'Cold storage (watch-only)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class UpdateWalletLabelDto {
  @ApiProperty({ example: 'Savings' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;
}
