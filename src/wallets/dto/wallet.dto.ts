import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

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
  @Matches(/^G[A-Z0-9]{55}$/, {
    message: 'publicKey must be a valid Stellar public key',
  })
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
