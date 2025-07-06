import { ApiProperty } from "@nestjs/swagger"
import { IsString, IsNumber, IsEnum, IsOptional, Min, IsNotEmpty } from "class-validator"
import { WithdrawalMethod } from "../enums/withdrawalMethod.enum"

export class CreateWithdrawalDto {
  @ApiProperty({
    description: "Currency or asset to withdraw",
    example: "USDC",
  })
  @IsString()
  @IsNotEmpty()
  currency: string

  @ApiProperty({
    description: "Amount to withdraw",
    example: 100.5,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01, { message: "Amount must be greater than 0" })
  amount: number

  @ApiProperty({
    description: "Destination wallet address or bank account",
    example: "GCKFBEIYTKP6RCZNVPH73XL7XFWTEOAO7GIHS4UECXCJBDZK5DQHQY6",
  })
  @IsString()
  @IsNotEmpty()
  destination: string

  @ApiProperty({
    description: "Withdrawal method",
    enum: WithdrawalMethod,
    example: WithdrawalMethod.WALLET,
  })
  @IsEnum(WithdrawalMethod)
  method: WithdrawalMethod

  @ApiProperty({
    description: "Optional description for the withdrawal",
    example: "Withdrawal to external wallet",
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string
}
