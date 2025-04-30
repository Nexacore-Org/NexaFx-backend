// `src/referrals/dto/create-referral.dto.ts`
import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({
    description: 'ID of the user generating the referral code',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsNotEmpty()
  @IsUUID()
  referrerUserId: string;
}