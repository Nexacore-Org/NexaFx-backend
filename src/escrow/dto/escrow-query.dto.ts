import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EscrowStatus } from '../entities/escrow.entity';

export class EscrowQueryDto {
  @ApiPropertyOptional({ enum: EscrowStatus })
  @IsOptional()
  @IsEnum(EscrowStatus)
  status?: EscrowStatus;
}
