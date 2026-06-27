import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserKycTier } from '../../users/user.entity';

/**
 * ResubmitKycDto — same as SubmitKycDto for resubmission flow.
 */
export class ResubmitKycDto {
  @ApiProperty({
    enum: [UserKycTier.STANDARD, UserKycTier.ENHANCED],
    description: 'Target KYC tier to resubmit for',
  })
  @IsEnum(UserKycTier)
  @IsNotEmpty()
  targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED;
}
