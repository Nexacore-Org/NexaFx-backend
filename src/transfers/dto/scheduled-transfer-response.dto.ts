import { ApiProperty } from "@nestjs/swagger"
import { ScheduledTransferStatus } from "../entities/scheduled-transfer.entity"

export class ScheduledTransferResponseDto {
  @ApiProperty({ example: '1' })
  id: string

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string

  @ApiProperty({ example: '321e4567-e89b-12d3-a456-426614174000' })
  fromCurrencyId: string

  @ApiProperty({ example: { id: '321e4567-e89b-12d3-a456-426614174000', code: 'USD', name: 'US Dollar' } })
  fromCurrency: { id: string; code: string; name: string }

  @ApiProperty({ example: '654e3217-e89b-12d3-a456-426614174000' })
  toCurrencyId: string

  @ApiProperty({ example: { id: '654e3217-e89b-12d3-a456-426614174000', code: 'EUR', name: 'Euro' } })
  toCurrency: { id: string; code: string; name: string }

  @ApiProperty({ example: 100.5 })
  amount: number

  @ApiProperty({ example: '2024-07-01T10:00:00Z' })
  scheduledAt: Date

  @ApiProperty({ enum: ScheduledTransferStatus, example: ScheduledTransferStatus.PENDING })
  status: ScheduledTransferStatus

  @ApiProperty({ example: null })
  executedAt: Date | null

  @ApiProperty({ example: null })
  transactionId: string | null

  @ApiProperty({ example: null })
  failureReason: string | null

  @ApiProperty({ example: null })
  destinationAddress: string | null

  @ApiProperty({ example: 'Salary June' })
  reference: string | null

  @ApiProperty({ example: '2024-07-01T10:00:00Z' })
  createdAt: Date

  @ApiProperty({ example: '2024-07-01T10:00:00Z' })
  updatedAt: Date
}
