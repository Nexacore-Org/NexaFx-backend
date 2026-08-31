// src/data-residency/dto/set-policy.dto.ts
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { DataRegion } from '../entities/data-residency-policy.entity';

export class SetDataResidencyPolicyDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(DataRegion)
  requiredRegion: DataRegion;
}