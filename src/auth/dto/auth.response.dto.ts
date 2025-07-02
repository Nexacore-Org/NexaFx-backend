import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==' })
  refreshToken: string;

  @ApiProperty({ example: 3600, description: 'Expiry time in seconds' })
  expiresIn: number; // Expiry time in seconds

  @ApiProperty({ example: { id: '123e4567-e89b-12d3-a456-426614174000', email: 'user@example.com', username: 'johndoe' } })
  user: {
    id: string;
    email: string;
    username: string;
  };
}
