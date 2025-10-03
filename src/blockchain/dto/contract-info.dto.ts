import { ApiProperty } from '@nestjs/swagger';

export class ContractInfoDto {
    @ApiProperty()
    contractId: string;

    @ApiProperty()
    status: string;

    @ApiProperty()
    network: string;

    @ApiProperty()
    deployedAt?: Date;

    @ApiProperty()
    lastInteraction?: Date;
}