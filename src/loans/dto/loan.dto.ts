import {
  IsNumber,
  IsPositive,
  IsIn,
  Min,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyLoanDto {
  @ApiProperty({ example: 100, description: 'Amount of XLM to borrow' })
  @IsNumber()
  @IsPositive()
  requestedAmount: number;

  @ApiProperty({ example: 30, description: 'Loan term in days: 30, 60, or 90' })
  @IsIn([30, 60, 90])
  termDays: number;
}

export class RepayLoanDto {
  @ApiProperty({ example: 50, description: 'Amount of XLM to repay' })
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class AdminApproveLoanDto {
  @ApiProperty({ example: 100, description: 'Approved loan amount in XLM' })
  @IsNumber()
  @IsPositive()
  approvedAmount: number;

  @ApiProperty({ example: 5.0, description: 'Annual interest rate percent' })
  @IsNumber()
  @Min(0)
  interestRatePercent: number;
}

export class AdminRejectLoanDto {
  @ApiPropertyOptional({ example: 'Insufficient credit history' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LoanQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
