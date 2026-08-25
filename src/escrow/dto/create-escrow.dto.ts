import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CreateEscrowDto {
  @ApiProperty({ example: 'recipient@example.com' })
  @IsEmail()
  recipientEmail: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'XLM' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 'Website development milestone 1' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Release the funds once milestone 1 is completed' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Complete design and submit assets for review' })
  @IsString()
  @IsNotEmpty()
  releaseCondition: string;

  @ApiProperty({ required: false, example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  autoReleaseAt?: string;

  @ApiProperty({ required: false, example: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  disputeWindowHours?: number;
}
