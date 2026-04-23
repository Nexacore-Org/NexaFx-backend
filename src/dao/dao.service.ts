import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  Horizon,
  rpc,
} from 'stellar-sdk';
import {
  RewardDistribution,
  RewardDistributionStatus,
} from './entities/reward-distribution.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class DaoService {
  private readonly logger = new Logger(DaoService.name);
  private readonly sorobanRpcUrl: string;
  private readonly defaultContractId: string;
  private readonly networkPassphrase: string | null = null;
  private readonly hotWalletKeypair: Keypair | null = null;
  private readonly sorobanServer: rpc.Server | null = null;
  private readonly horizonServer: Horizon.Server | null = null;
  private readonly daoConfigError: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RewardDistribution)
    private readonly rewardDistributionRepo: Repository<RewardDistribution>,
    private readonly auditLogsService: AuditLogsService,
  ) {
    this.sorobanRpcUrl =
      this.configService.get<string>('STELLAR_SOROBAN_RPC_URL') || '';
    this.defaultContractId =
      this.configService.get<string>('DAO_CONTRACT_ID') || '';

    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL');
    const network = this.configService.get<string>('STELLAR_NETWORK');
    const hotWalletSecret = this.configService.get<string>(
      'STELLAR_HOT_WALLET_SECRET',
    );

    if (!this.sorobanRpcUrl) {
      this.daoConfigError = 'STELLAR_SOROBAN_RPC_URL must be set';
      return;
    }
    if (!this.defaultContractId) {
      this.daoConfigError = 'DAO_CONTRACT_ID must be set';
      return;
    }
    if (!horizonUrl || !network || !hotWalletSecret) {
      this.daoConfigError =
        'Stellar environment variables not configured for DAO service';
      return;
    }

    this.networkPassphrase = Networks[network as keyof typeof Networks];
    if (!this.networkPassphrase) {
      this.daoConfigError = `Unsupported Stellar network: ${network}`;
      return;
    }

    try {
      this.hotWalletKeypair = Keypair.fromSecret(hotWalletSecret);
      this.sorobanServer = new rpc.Server(this.sorobanRpcUrl);
      this.horizonServer = new Horizon.Server(horizonUrl);
    } catch (error) {
      this.daoConfigError =
        error instanceof Error ? error.message : 'Invalid DAO config';
    }
  }

  async invokeContract(
    contractId: string,
    functionName: string,
    args: any[] = [],
  ): Promise<{ txHash: string; result: any }> {
    const targetContractId = contractId || this.defaultContractId;

    if (
      this.daoConfigError ||
      !this.sorobanServer ||
      !this.horizonServer ||
      !this.hotWalletKeypair ||
      !this.networkPassphrase
    ) {
      throw new HttpException(
        `DAO service not configured: ${this.daoConfigError ?? 'missing dependencies'}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!targetContractId) {
      throw new HttpException(
        'Contract ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify Soroban RPC health
    try {
      await this.sorobanServer.getNetwork();
    } catch (err: any) {
      this.logger.error('Soroban RPC unavailable', err?.message || err);
      throw new HttpException(
        'Soroban RPC server unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const hostArgs = (args || []).map((item) => nativeToScVal(item));

      const sourcePublicKey = this.hotWalletKeypair.publicKey();
      const account = await this.horizonServer.loadAccount(sourcePublicKey);

      const operation = Operation.invokeContractFunction({
        contract: targetContractId,
        function: functionName,
        args: hostArgs,
        source: sourcePublicKey,
      });

      const baseFee = this.configService.get<number>('STELLAR_BASE_FEE') || 100;
      const transaction = new TransactionBuilder(account, {
        fee: String(baseFee),
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(180)
        .build();

      const prepared = await this.sorobanServer.prepareTransaction(transaction);
      prepared.sign(this.hotWalletKeypair);

      const submitResult = await this.sorobanServer.sendTransaction(prepared);

      return {
        txHash: submitResult.hash,
        result: submitResult,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed Soroban contract invocation for ${contractId}.${functionName}`,
        err?.message || err,
      );

      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        `Contract invocation failed: ${err?.message || 'unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async distributeReward(
    adminId: string,
    payload: {
      userId: string;
      contractId?: string;
      functionName: string;
      args?: any[];
      amount: number;
      currency: string;
    },
  ): Promise<RewardDistribution> {
    const contractId = payload.contractId || this.defaultContractId;

    let distribution = this.rewardDistributionRepo.create({
      userId: payload.userId,
      contractId,
      functionName: payload.functionName,
      args: payload.args || null,
      amount: payload.amount,
      currency: payload.currency,
      txHash: null,
      status: RewardDistributionStatus.PENDING,
      errorMessage: null,
    });

    distribution = await this.rewardDistributionRepo.save(distribution);

    await this.auditLogsService.logSystemEvent(
      `DAO reward distribution attempt`,
      distribution.id,
      {
        adminId,
        userId: payload.userId,
        contractId,
        functionName: payload.functionName,
        amount: payload.amount,
        currency: payload.currency,
      },
    );

    try {
      const { txHash } = await this.invokeContract(
        contractId,
        payload.functionName,
        payload.args || [],
      );

      distribution.txHash = txHash;
      distribution.status = RewardDistributionStatus.SUCCESS;
      await this.rewardDistributionRepo.save(distribution);

      await this.auditLogsService.logSystemEvent(
        `DAO reward distribution succeeded`,
        distribution.id,
        {
          adminId,
          txHash,
          distributionId: distribution.id,
        },
      );

      return distribution;
    } catch (err: any) {
      if (
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
      ) {
        this.logger.warn('Soroban RPC unavailable - distribution aborted');
        throw err;
      }

      distribution.status = RewardDistributionStatus.FAILED;
      distribution.errorMessage = err?.message || 'Contract invocation failed';
      await this.rewardDistributionRepo.save(distribution);

      await this.auditLogsService.logSystemEvent(
        `DAO reward distribution failed`,
        distribution.id,
        {
          adminId,
          error: distribution.errorMessage,
          distributionId: distribution.id,
        },
      );

      return distribution;
    }
  }

  async getDistributions(page = 1, limit = 20) {
    const take = Math.min(limit, 200);
    const skip = (page - 1) * take;

    const [items, total] = await this.rewardDistributionRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return {
      items,
      pagination: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }
}
