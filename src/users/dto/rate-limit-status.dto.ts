import { IsEnum, IsInt, IsOptional, IsDateString } from 'class-validator';
import { UserPlan } from '../user.entity';

export class RateLimitStatusDto {
  @IsEnum(UserPlan)
  plan: UserPlan;

  @IsInt()
  @IsOptional()
  limitPerMinute: number | null;

  @IsInt()
  usedInCurrentWindow: number;

  @IsInt()
  @IsOptional()
  remaining: number | null;

  @IsDateString()
  @IsOptional()
  resetAt: string | null;

  @IsOptional()
  isUnlimited: boolean;
}
