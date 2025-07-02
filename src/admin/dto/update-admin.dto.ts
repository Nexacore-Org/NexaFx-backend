import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAdminDto } from './create-admin.dto';

export class UpdateAdminDto extends PartialType(CreateAdminDto) {
  @ApiPropertyOptional({ example: 'admin.updated@example.com' })
  email?: string;

  @ApiPropertyOptional({ example: 'NewStrongPassword123!' })
  password?: string;
}
