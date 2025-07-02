import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'Jane' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'jane.smith@example.com' })
  email?: string;

  @ApiPropertyOptional({ example: 'StrongNewPassword456!' })
  password?: string;

  @ApiPropertyOptional({ example: '+1987654321' })
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '456 Main St, City, Country' })
  address?: string;

  @ApiPropertyOptional({ example: 'https://example.com/profile2.jpg' })
  profilePicture?: string;

  @ApiPropertyOptional({ example: 'Updated bio for the user.' })
  bio?: string;
}
