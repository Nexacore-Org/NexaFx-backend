import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Matches } from 'class-validator';

export class CreateWalletDto {
    @ApiProperty({ description: 'Stellar wallet address', required: false })
    @IsString()
    @IsOptional()
    @Matches(/^G[0-9A-Z]{55}$/, { message: 'Invalid Stellar address format' })
    stellarAddress?: string;

    @ApiProperty({ description: 'MetaMask wallet address', required: false })
    @IsString()
    @IsOptional()
    @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid Ethereum address format' })
    metamaskAddress?: string;

    @ApiProperty({ description: 'Whether this is the primary wallet', default: false })
    @IsBoolean()
    @IsOptional()
    isPrimary?: boolean;
} 