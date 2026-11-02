import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const FEATURE_FLAG_KEY_REGEX =
  /^(?!archived_)[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export class CreateFeatureFlagDto {
  @IsString()
  @IsNotEmpty()
  @Matches(FEATURE_FLAG_KEY_REGEX, {
    message:
      'key must be alphanumeric (with underscores or hyphens) and must not start with archived_',
  })
  key: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  targetUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  environments?: string[];
}
