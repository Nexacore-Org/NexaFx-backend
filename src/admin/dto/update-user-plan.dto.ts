import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserPlan } from '../../users/user.entity';

export class UpdateUserPlanDto {
  @IsNotEmpty()
  @IsEnum(UserPlan)
  plan: UserPlan;
}
