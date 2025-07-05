import { IsString, IsNumber, IsPositive, IsNotEmpty } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class ConversionQuoteDto {
  @ApiProperty({
    description: "Source currency code",
    example: "NGN",
  })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string

  @ApiProperty({
    description: "Target currency code",
    example: "USDC",
  })
  @IsString()
  @IsNotEmpty()
  toCurrency: string

  @ApiProperty({
    description: "Amount to convert",
    example: 25000,
  })
  @IsNumber()
  @IsPositive()
  amount: number
}

export class ConversionQuoteResponseDto {
  @ApiProperty({
    description: "Current exchange rate",
    example: 1610,
  })
  exchangeRate: number

  @ApiProperty({
    description: "Amount that will be received",
    example: 15.5,
  })
  convertedAmount: number

  @ApiProperty({
    description: "Transaction fee",
    example: 200,
  })
  feeAmount: number

  @ApiProperty({
    description: "Fee currency",
    example: "NGN",
  })
  feeCurrency: string

  @ApiProperty({
    description: "Total amount to be deducted (amount + fee)",
    example: 25200,
  })
  totalDeduction: number

  @ApiProperty({
    description: "Quote expiration time",
    example: "2025-01-05T12:05:00Z",
  })
  expiresAt: Date

  @ApiProperty({
    description: "Quote ID for reference",
    example: "quote_123456",
  })
  quoteId: string
}
