import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty()
  isPhoneVerified: boolean;

  @ApiPropertyOptional()
  dateOfBirth?: Date;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional()
  profilePicture?: string;

  @ApiPropertyOptional()
  bio?: string;

  @ApiProperty()
  verificationStatus: string;

  @ApiProperty()
  profileCompletionPercentage: number;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty()
  createdAt: Date;
}


