import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserKycTier } from '../../users/user.entity';

/**
 * SubmitKycDto — the user selects which tier they're applying for.
 * File uploads are handled separately via multipart/form-data.
 */
export class SubmitKycDto {
  @ApiProperty({
    enum: [UserKycTier.STANDARD, UserKycTier.ENHANCED],
    description: 'Target KYC tier to upgrade to',
  })
  @IsEnum(UserKycTier)
  @IsNotEmpty()
  targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED;
}
