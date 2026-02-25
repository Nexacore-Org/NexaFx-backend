import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class UpdateUserRoleDto {
  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;
}
