import {
  IsUUID,
  IsNotEmpty,
  IsPositive,
  IsDateString,
  IsOptional,
  IsString,
  MinDate,
  ValidateIf,
} from "class-validator"
import { Type } from "class-transformer"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class CreateScheduledTransferDto {
  @ApiProperty({ description: "Source currency ID" })
  @IsUUID()
  @IsNotEmpty()
  fromCurrencyId: string

  @ApiProperty({ description: "Destination currency ID" })
  @IsUUID()
  @IsNotEmpty()
  toCurrencyId: string

  @ApiProperty({ description: "Amount to transfer", example: 100.5 })
  @IsPositive()
  amount: number

  @ApiProperty({ description: "When to execute the transfer", example: "2025-06-15T10:00:00Z" })
  @IsDateString()
  @Type(() => Date)
  @MinDate(new Date(), { message: "Scheduled date must be in the future" })
  scheduledAt: Date

  @ApiPropertyOptional({ description: "Destination wallet address for external transfers" })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.destinationAddress !== undefined)
  destinationAddress?: string

  @ApiPropertyOptional({ description: "Reference or memo for the transfer" })
  @IsOptional()
  @IsString()
  reference?: string

  @ApiPropertyOptional({ description: "Additional metadata for the transfer" })
  @IsOptional()
  metadata?: Record<string, any>
}
