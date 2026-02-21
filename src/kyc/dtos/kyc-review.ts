import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from '../entities/kyc.entity';

export class ReviewKycDto {
  @IsEnum(KycStatus)
  decision: KycStatus; 

  @IsOptional()
  @IsString()
  reason?: string;
}