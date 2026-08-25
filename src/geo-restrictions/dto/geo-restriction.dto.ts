import { IsString, IsEnum, IsOptional, IsBoolean, IsNumberString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RestrictionType } from '../entities/geo-restriction.entity';

export class CreateGeoRestrictionDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() @Length(2, 2) countryCode: string;
  @ApiProperty({ enum: RestrictionType }) @IsEnum(RestrictionType) restrictionType: RestrictionType;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() limitAmountUsd?: string;
  @ApiProperty() @IsString() reason: string;
}

export class UpdateGeoRestrictionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: RestrictionType }) @IsOptional() @IsEnum(RestrictionType) restrictionType?: RestrictionType;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() limitAmountUsd?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
