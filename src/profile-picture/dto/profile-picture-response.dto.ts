import { ApiProperty } from '@nestjs/swagger';

export class ProfilePictureResponseDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'profile_123.jpg' })
  fileName: string;

  @ApiProperty({ example: 'profile.jpg' })
  originalName: string;

  @ApiProperty({ example: 'https://example.com/profile_123.jpg' })
  fileUrl: string;

  @ApiProperty({ example: 204800 })
  fileSize: number;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-07-01T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-07-01T10:00:00Z' })
  updatedAt: Date;
}
