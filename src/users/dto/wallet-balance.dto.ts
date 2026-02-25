import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WalletBalanceItemDto {
  @ApiProperty({ example: 'XLM' })
  asset: string;

  @ApiProperty({ example: '10.5000000' })
  balance: string;

  @ApiPropertyOptional({
    example: 'GD5DJ67...ISSUER',
    description: 'Issuer account for non-native Stellar assets',
  })
  assetIssuer?: string;

  @ApiProperty({ example: 3250.45 })
  valueUSD: number;

  @ApiProperty({ example: 4973625.1 })
  valueNGN: number;
}

export class WalletBalancesResponseDto {
  @ApiProperty({ example: 'GABC...PUBLICKEY' })
  walletPublicKey: string;

  @ApiProperty({ example: true })
  isFunded: boolean;

  @ApiProperty({ type: [WalletBalanceItemDto] })
  balances: WalletBalanceItemDto[];

  @ApiProperty({ example: 3250.45 })
  totalValueUSD: number;

  @ApiProperty({ example: 4973625.1 })
  totalValueNGN: number;

  @ApiProperty({ example: '2026-02-23T10:00:00.000Z' })
  fetchedAt: string;

  @ApiProperty({ example: true })
  cached: boolean;
}
