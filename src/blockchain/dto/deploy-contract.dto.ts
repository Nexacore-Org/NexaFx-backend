import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeployContractDto {
    @ApiProperty({ description: 'WASM hash of the contract to deploy' })
    @IsString()
    wasmHash: string;

    @ApiProperty({ description: 'Constructor arguments for the contract', required: false })
    @IsOptional()
    @IsObject()
    constructorArgs?: Record<string, any>;
}