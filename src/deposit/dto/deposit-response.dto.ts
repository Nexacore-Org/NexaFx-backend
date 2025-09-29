import { ApiProperty } from '@nestjs/swagger';
import { DepositMethod } from '../enums/depositMethod.enum';

export class DepositResponseDto {
  @ApiProperty({ description: 'Unique deposit transaction ID' })
  id: string;

  @ApiProperty({ description: 'User ID who initiated the deposit' })
  userId: string;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Deposit amount' })
  amount: number;

  @ApiProperty({ description: 'Deposit method used' })
  method: DepositMethod;

  @ApiProperty({ description: 'Transaction status' })
  status: string;

  @ApiProperty({ description: 'Unique deposit reference' })
  reference: string;

  @ApiProperty({
    description: 'Destination wallet address for crypto deposits',
  })
  destinationAddress?: string;

  @ApiProperty({ description: 'QR code data for wallet address' })
  qrCodeData?: string;

  @ApiProperty({ description: 'Fee amount (currently 0%)' })
  feeAmount: number;

  @ApiProperty({ description: 'Total amount including fees' })
  totalAmount: number;

  @ApiProperty({ description: 'Additional metadata' })
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class WalletAddressResponseDto {
  @ApiProperty({ description: 'Generated wallet address' })
  address: string;

  @ApiProperty({ description: 'QR code data URL' })
  qrCode: string;

  @ApiProperty({ description: 'Currency for this address' })
  currency: string;

  @ApiProperty({ description: 'Network information' })
  network?: string;
}

export class DepositMethodsResponseDto {
  @ApiProperty({ description: 'Available deposit methods' })
  methods: {
    type: DepositMethod;
    name: string;
    description: string;
    fee: string;
    enabled: boolean;
  }[];
}
