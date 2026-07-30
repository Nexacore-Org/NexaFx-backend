import { IsUUID, IsNumberString, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDonationDto {
  @ApiProperty() @IsUUID() campaignId: string;
  @ApiProperty() @IsNumberString() amount: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
}

export class CreateCharityDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsString() stellarWalletAddress: string;
  @ApiPropertyOptional() @IsOptional() @IsString() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNumber?: string;
}

export class CreateCampaignDto {
  @ApiProperty() @IsUUID() charityId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() targetAmount?: string;
}
