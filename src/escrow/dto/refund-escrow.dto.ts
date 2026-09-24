import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefundEscrowDto {
  @ApiPropertyOptional({ example: 'Recipient agreed to refund because the work was not completed' })
  @IsOptional()
  @IsString()
  reason?: string;
}
