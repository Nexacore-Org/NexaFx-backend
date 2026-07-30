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

  @ApiPropertyOptional({ example: ['trading', 'savings'] })
  @IsOptional()
  @IsString({ each: true })
  customLabels?: string[];

  @ApiPropertyOptional({ example: 'Trading' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ example: '#FF0000' })
  @IsOptional()
  @IsString()
  colorCode?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isHidden?: boolean;
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

  @ApiPropertyOptional({ example: ['watch-only', 'cold'] })
  @IsOptional()
  @IsString({ each: true })
  customLabels?: string[];

  @ApiPropertyOptional({ example: 'Savings' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ example: '#0000FF' })
  @IsOptional()
  @IsString()
  colorCode?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isHidden?: boolean;
}

export class UpdateWalletLabelDto {
  @ApiPropertyOptional({ example: 'Savings' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ example: ['savings', 'personal'] })
  @IsOptional()
  @IsString({ each: true })
  customLabels?: string[];

  @ApiPropertyOptional({ example: 'Savings' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ example: '#00FF00' })
  @IsOptional()
  @IsString()
  colorCode?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isHidden?: boolean;
}
