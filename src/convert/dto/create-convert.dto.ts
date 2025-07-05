import { IsString, IsNumber, IsPositive, IsNotEmpty, IsOptional } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class CreateConvertDto {
  @ApiProperty({
    description: "Source currency code",
    example: "NGN",
    enum: ["NGN", "USD", "USDC", "BTC", "ETH", "USDT", "BNB"],
  })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string

  @ApiProperty({
    description: "Target currency code",
    example: "USDC",
    enum: ["NGN", "USD", "USDC", "BTC", "ETH", "USDT", "BNB"],
  })
  @IsString()
  @IsNotEmpty()
  toCurrency: string

  @ApiProperty({
    description: "Amount to convert",
    example: 25000,
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  amount: number

  @ApiProperty({
    description: "Optional description for the conversion",
    example: "Converting NGN to USDC for trading",
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string
}
