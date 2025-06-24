import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class ExternalWalletResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  address: string;

  @ApiProperty()
  @Expose()
  network: string;

  @ApiProperty()
  @Expose()
  walletType: string;

  @ApiProperty()
  @Expose()
  label: string;

  @ApiProperty()
  @Expose()
  isActive: boolean;

  @ApiProperty()
  @Expose()
  lastUsed: Date;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  // Exclude sensitive data
  @Exclude()
  verificationSignature: string;

  @Exclude()
  verificationMessage: string;

  @Exclude()
  userId: string;
}