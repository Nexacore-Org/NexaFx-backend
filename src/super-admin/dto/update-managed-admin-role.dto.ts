import { IsEnum } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class UpdateManagedAdminRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
