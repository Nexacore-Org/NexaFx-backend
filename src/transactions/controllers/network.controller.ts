import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  TransactionConfidenceService,
  StellarNetworkStatus,
} from '../services/transaction-confidence.service';

@ApiTags('Network')
@Controller({ path: 'network', version: '2' })
export class NetworkController {
  constructor(
    private readonly confidenceService: TransactionConfidenceService,
  ) {}

  @Get('stellar/status')
  @Public()
  @ApiOperation({
    summary: 'Get Stellar network health status',
    description:
      'Returns current Stellar network health information including ledger close time, ' +
      'base fee, queued transactions, and overall network status. Cached for 15 seconds.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stellar network status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        ledgerCloseTimeMs: { type: 'number', example: 5500 },
        baseFee: { type: 'string', example: '100' },
        queuedTransactions: { type: 'number', example: 0 },
        networkStatus: {
          type: 'string',
          enum: ['HEALTHY', 'DEGRADED', 'CONGESTED'],
          example: 'HEALTHY',
        },
        lastLedger: { type: 'number', example: 50000000 },
        ledgerCloseTime: {
          type: 'string',
          example: '2024-01-15T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Stellar network status unavailable',
  })
  async getStellarNetworkStatus(): Promise<StellarNetworkStatus> {
    return this.confidenceService.getNetworkStatus();
  }
}
