import { ApiProperty } from "@nestjs/swagger"
import { ScheduledTransferStatus } from "../entities/scheduled-transfer.entity"

export class ScheduledTransferResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  userId: string

  @ApiProperty()
  fromCurrencyId: string

  @ApiProperty()
  fromCurrency: {
    id: string
    code: string
    name: string
  }

  @ApiProperty()
  toCurrencyId: string

  @ApiProperty()
  toCurrency: {
    id: string
    code: string
    name: string
  }

  @ApiProperty()
  amount: number

  @ApiProperty()
  scheduledAt: Date

  @ApiProperty({ enum: ScheduledTransferStatus })
  status: ScheduledTransferStatus

  @ApiProperty({ nullable: true })
  executedAt: Date | null

  @ApiProperty({ nullable: true })
  transactionId: string | null

  @ApiProperty({ nullable: true })
  failureReason: string | null

  @ApiProperty({ nullable: true })
  destinationAddress: string | null

  @ApiProperty({ nullable: true })
  reference: string | null

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}
