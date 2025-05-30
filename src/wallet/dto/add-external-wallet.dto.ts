import { IsString, IsEthereumAddress, IsOptional, IsIn, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddExternalWalletDto {
  @ApiProperty({
    description: 'Ethereum wallet address',
    example: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
  })
  @IsEthereumAddress()
  address: string;

  @ApiProperty({
    description: 'Blockchain network',
    example: 'ethereum',
    enum: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism']
  })
  @IsString()
  @IsIn(['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism'])
  network: string;

  @ApiProperty({
    description: 'Type of wallet used',
    example: 'metamask',
    enum: ['metamask', 'walletconnect', 'coinbase', 'trust', 'other']
  })
  @IsString()
  @IsIn(['metamask', 'walletconnect', 'coinbase', 'trust', 'other'])
  walletType: string;

  @ApiProperty({
    description: 'Signature proving wallet ownership',
    example: '0x...'
  })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{130}$/, {
    message: 'Invalid signature format'
  })
  signature: string;

  @ApiProperty({
    description: 'Message that was signed',
    example: 'I am linking this wallet to my account. Timestamp: 1640995200'
  })
  @IsString()
  @Length(10, 500)
  message: string;

  @ApiPropertyOptional({
    description: 'User-defined label for the wallet',
    example: 'My MetaMask Wallet'
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;
}