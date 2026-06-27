import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DisputeOutcome {
  VALID = 'VALID',
  CHARGEBACK = 'CHARGEBACK',
}

export class ResolveDisputeDto {
  @ApiProperty({
    enum: DisputeOutcome,
    description:
      'VALID: mark dispute resolved as valid (no fund movement). ' +
      'CHARGEBACK: reverse the transaction by debiting respondent and crediting claimant.',
  })
  @IsEnum(DisputeOutcome)
  outcome: DisputeOutcome;

  @ApiProperty({
    description: 'Admin resolution notes',
    maxLength: 4000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  resolution: string;
}
