import { IsString, IsOptional, IsBoolean, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExternalWalletDto {
  @ApiPropertyOptional({
    description: 'User-defined label for the wallet',
    example: 'Updated Wallet Label'
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Whether the wallet is active',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}