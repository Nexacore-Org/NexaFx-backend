import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number; // Expiry time in seconds

  @ApiProperty()
  user: {
    id: string;
    email: string;
    username: string;
  };
}
