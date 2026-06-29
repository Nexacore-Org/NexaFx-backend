import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EscrowStatus } from '../entities/escrow.entity';

export class AdminResolveEscrowDto {
  @ApiProperty({ enum: ['release', 'refund'], example: 'release' })
  @IsEnum(['release', 'refund'] as const)
  outcome: 'release' | 'refund';

  @ApiProperty({ required: false, example: 'Admin review resolved in favor of the sender' })
  @IsOptional()
  @IsString()
  reason?: string;
}
