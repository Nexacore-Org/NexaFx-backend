import { ApiProperty } from "@nestjs/swagger"

export class ProfilePictureResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  userId: string

  @ApiProperty()
  fileName: string

  @ApiProperty()
  originalName: string

  @ApiProperty()
  fileUrl: string

  @ApiProperty()
  fileSize: number

  @ApiProperty()
  mimeType: string

  @ApiProperty()
  isActive: boolean

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}
