import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserKycTier } from '../../users/user.entity';

export class ResubmitKycDto {
  @ApiProperty({
    description: 'Target KYC tier to resubmit for',
    enum: [UserKycTier.STANDARD, UserKycTier.ENHANCED],
    required: false,
  })
  @IsOptional()
  @IsEnum(UserKycTier)
  targetTier?: UserKycTier.STANDARD | UserKycTier.ENHANCED;
}
