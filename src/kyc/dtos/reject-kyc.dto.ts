import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectKycDto {
  @ApiProperty({
    description: 'Reason for rejection',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'Whether the user needs to resubmit documents',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  requiresResubmission?: boolean;
}
