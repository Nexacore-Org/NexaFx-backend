import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApplicationTargetTier } from '../entities/kyc-application.entity';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyKycDto {
  @ApiProperty({
    enum: ApplicationTargetTier,
    description: 'Target KYC tier to apply for',
  })
  @IsEnum(ApplicationTargetTier)
  @IsNotEmpty()
  targetTier: ApplicationTargetTier;
}
