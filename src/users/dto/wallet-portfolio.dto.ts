import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortfolioHoldingDto {
  @ApiProperty({ example: 'XLM' })
  asset: string;

  @ApiProperty({ example: '10.5000000' })
  balance: string;

  @ApiPropertyOptional({ example: 'GD5DJ67...ISSUER' })
  assetIssuer?: string;

  @ApiProperty({ example: 3250.45 })
  valueUSD: number;

  @ApiProperty({ example: 4973625.1 })
  valueNGN: number;

  @ApiProperty({ example: 65.7 })
  percentageOfPortfolio: number;
}

export class WalletPortfolioResponseDto {
  @ApiProperty({ example: 'GABC...PUBLICKEY' })
  walletPublicKey: string;

  @ApiProperty({ example: true })
  isFunded: boolean;

  @ApiProperty({ example: 4948.33 })
  totalPortfolioValueUSD: number;

  @ApiProperty({ example: 7560910.2 })
  totalPortfolioValueNGN: number;

  @ApiProperty({ type: [PortfolioHoldingDto] })
  holdings: PortfolioHoldingDto[];

  @ApiProperty({ example: '2026-02-23T10:00:00.000Z' })
  fetchedAt: string;

  @ApiProperty({ example: true })
  cached: boolean;
}
