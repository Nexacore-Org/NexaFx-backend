import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from '../entities/kyc.entity';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveKycDto {
  @ApiProperty({ enum: KycStatus, description: 'KYC verification status' })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiProperty({ description: 'Reason for rejection if status is REJECTED', required: false })
  @IsString()
  @IsOptional()
  rejectionReason?: string;
} 