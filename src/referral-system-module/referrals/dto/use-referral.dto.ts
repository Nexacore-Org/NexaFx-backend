import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UseReferralDto {
  @ApiProperty({
    description: 'The referral code to be used',
    example: 'abc123-xyz789'
  })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({
    description: 'ID of the user using the referral code',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsNotEmpty()
  @IsUUID()
  referredUserId: string;
}