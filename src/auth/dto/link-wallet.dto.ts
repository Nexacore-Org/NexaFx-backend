import { IsNotEmpty, IsString } from 'class-validator';

export class LinkWalletDto {
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
