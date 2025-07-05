import { ApiProperty } from "@nestjs/swagger"

export class ActivityLogResponseDto {
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  id: string

  @ApiProperty({ example: "192.168.1.1" })
  ipAddress: string

  @ApiProperty({ example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" })
  userAgent: string

  @ApiProperty({ example: "Desktop" })
  deviceType: string

  @ApiProperty({ example: "Chrome" })
  browser: string

  @ApiProperty({ example: "Windows" })
  operatingSystem: string

  @ApiProperty({ example: "Lagos, Nigeria" })
  location: string

  @ApiProperty({ example: "2024-01-15T10:30:00Z" })
  loggedInAt: Date

  @ApiProperty({ example: "2024-01-15T18:45:00Z", nullable: true })
  loggedOutAt: Date | null

  @ApiProperty({ example: true })
  isActive: boolean

  @ApiProperty({ example: "LOGIN" })
  activityType: string

  @ApiProperty({ example: true })
  isCurrentSession: boolean
}

export class SessionListResponseDto {
  @ApiProperty({ type: [ActivityLogResponseDto] })
  sessions: ActivityLogResponseDto[]

  @ApiProperty({ example: 5 })
  totalActiveSessions: number

  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  currentSessionId: string
}

export class LogoutResponseDto {
  @ApiProperty({ example: "Successfully logged out" })
  message: string

  @ApiProperty({ example: 3 })
  sessionsTerminated: number
}
