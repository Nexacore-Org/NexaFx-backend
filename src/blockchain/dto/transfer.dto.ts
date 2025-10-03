import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferDto {
    @ApiProperty({ description: 'Sender wallet address' })
    @IsString()
    from: string;

    @ApiProperty({ description: 'Recipient wallet address' })
    @IsString()
    to: string;

    @ApiProperty({ description: 'Amount to transfer' })
    @IsNumber()
    @Min(0.0000001)
    amount: number;

    @ApiProperty({ description: 'Asset code (e.g., NGN, XLM)', required: false })
    @IsOptional()
    @IsString()
    assetCode?: string;

    @ApiProperty({ description: 'Memo for transaction', required: false })
    @IsOptional()
    @IsString()
    memo?: string;
}