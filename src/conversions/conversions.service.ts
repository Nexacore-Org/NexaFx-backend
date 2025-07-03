import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface ConversionPreviewInput {
  sourceCurrencyId: string;
  targetCurrencyId: string;
  amount: number;
  rateLockId?: string;
}

interface ConversionPreviewResult {
  sourceCurrencyId: string;
  targetCurrencyId: string;
  amount: number;
  rate: number;
  fee: number;
  netAmount: number;
  rateLockExpiresAt: Date;
  feeBreakdown: {
    type: string;
    value: number;
  }[];
}

@Injectable()
export class ConversionsService {
  preview(input: ConversionPreviewInput): ConversionPreviewResult {
    if (input.amount <= 0) {
      throw new HttpException('Amount must be positive', HttpStatus.BAD_REQUEST);
    }
    // Placeholder: In real implementation, fetch rate, validate rate lock, calculate fees
    return {
      sourceCurrencyId: input.sourceCurrencyId,
      targetCurrencyId: input.targetCurrencyId,
      amount: input.amount,
      rate: 1.23,
      fee: 2.5,
      netAmount: input.amount * 1.23 - 2.5,
      rateLockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      feeBreakdown: [
        { type: 'service', value: 1.5 },
        { type: 'network', value: 1.0 },
      ],
    };
  }
} 