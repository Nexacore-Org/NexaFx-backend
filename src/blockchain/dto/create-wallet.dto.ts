import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWalletDto {
    @ApiProperty({ description: 'User ID to associate with wallet' })
    @IsString()
    userId: string;

    @ApiProperty({ description: 'Optional wallet label', required: false })
    @IsOptional()
    @IsString()
    label?: string;
}