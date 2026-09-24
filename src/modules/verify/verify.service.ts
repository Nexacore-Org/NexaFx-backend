import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from 'stellar-sdk';
import {
  StellarTxVerificationResult,
  VerifiedOperationSummary,
} from './dto/verify.dto';

const DEFAULT_TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 10;

interface CacheEntry {
  data: StellarTxVerificationResult;
  expiresAt: number;
}

/**
 * Public, read-only Stellar transaction verification. NexaFX linkage lookup
 * is a stubbed hook (`nexafxReferences`) until the BlockchainOperation
 * ledger from issue #105 exists — kept as a small in-memory map rather than
 * a real join, per the "keep it small" scope for this scaffold.
 */
@Injectable()
export class VerifyService {
  private readonly server: Horizon.Server;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly nexafxReferences = new Map<string, string>();

  constructor(configService: ConfigService) {
    const horizonUrl =
      configService.get<string>('STELLAR_HORIZON_URL') ?? DEFAULT_TESTNET_HORIZON;
    this.server = new Horizon.Server(horizonUrl);
  }

  async verify(txHash: string): Promise<StellarTxVerificationResult> {
    const cached = this.cache.get(txHash);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let record: Horizon.ServerApi.TransactionRecord;
    try {
      record = await this.server.transactions().transaction(txHash).call();
    } catch {
      throw new NotFoundException(`Stellar transaction ${txHash} not found`);
    }

    const opsPage = await this.server.operations().forTransaction(txHash).call();
    const operations = opsPage.records.map((op) => this.summariseOperation(op));

    const nexafxReference = this.nexafxReferences.get(txHash) ?? null;

    const result: StellarTxVerificationResult = {
      hash: record.hash,
      status: record.successful ? 'SUCCESS' : 'FAILED',
      timestamp: record.created_at,
      fee: `${(Number(record.fee_charged) / 10_000_000).toFixed(7)} XLM`,
      ledger: record.ledger_attr,
      operations,
      summary: operations[0]?.summary ?? 'Stellar transaction',
      nexafxLinked: nexafxReference !== null,
      nexafxReference,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    };

    this.cache.set(txHash, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  async verifyBatch(hashes: string[]): Promise<StellarTxVerificationResult[]> {
    const limited = hashes.slice(0, MAX_BATCH_SIZE);
    return Promise.all(limited.map((hash) => this.verify(hash)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private summariseOperation(op: any): VerifiedOperationSummary {
    switch (op.type) {
      case 'payment':
        return {
          type: 'Payment',
          summary: `${op.amount} ${op.asset_type === 'native' ? 'XLM' : op.asset_code} sent from ${op.from} to ${op.to}`,
        };
      case 'change_trust':
        return {
          type: 'Change Trust',
          summary: `Established trustline for ${op.asset_code ?? op.line?.asset_code ?? 'asset'} from ${op.trustor ?? op.source_account}`,
        };
      case 'manage_sell_offer':
      case 'manage_buy_offer':
        return {
          type: 'Manage Offer',
          summary: `Created offer to sell ${op.amount} ${op.selling?.asset_code ?? 'XLM'} for ${op.buying?.asset_code ?? 'asset'}`,
        };
      case 'liquidity_pool_deposit':
        return {
          type: 'Liquidity Pool Deposit',
          summary: `Deposited liquidity into pool ${op.liquidity_pool_id}`,
        };
      default:
        return { type: op.type, summary: `${op.type} operation` };
    }
  }
}
