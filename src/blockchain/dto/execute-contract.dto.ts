import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteContractDto {
    @ApiProperty({ description: 'Contract function name to execute' })
    @IsString()
    functionName: string;

    @ApiProperty({ description: 'Function parameters' })
    @IsObject()
    params: Record<string, any>;

    @ApiProperty({ description: 'Source account secret key' })
    @IsString()
    sourceSecret: string;

    @ApiProperty({ description: 'Optional memo', required: false })
    @IsOptional()
    @IsString()
    memo?: string;
}