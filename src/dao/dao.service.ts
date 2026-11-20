import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Horizon,
  rpc,
} from 'stellar-sdk';
import {
  RewardDistribution,
  RewardDistributionStatus,
} from './entities/reward-distribution.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { User } from '../users/user.entity';
import { IdempotencyService } from '../common/services/idempotency.service';
import { DistributeRewardDto } from './dto/distribute-reward.dto';

const DAO_REWARD_FUNCTION = 'distribute';

function amountToStroops(amount: number): bigint {
  const [mantissa, exponentPart] = amount.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const shift = 7 - fraction.length + Number(exponentPart || 0);
  const value = BigInt(`${whole}${fraction}`);

  if (shift >= 0) {
    return value * 10n ** BigInt(shift);
  }

  const divisor = 10n ** BigInt(-shift);
  if (value % divisor !== 0n) {
    throw new Error('Amount cannot exceed 7 decimal places.');
  }
  return value / divisor;
}

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditLogsService: AuditLogsService,
    private readonly idempotencyService: IdempotencyService,
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

    if (
      contractId !== this.defaultContractId ||
      functionName !== DAO_REWARD_FUNCTION
    ) {
      throw new HttpException(
        'Only the configured DAO reward function may be invoked',
        HttpStatus.BAD_REQUEST,
      );
    }
    const targetContractId = this.defaultContractId;

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
      const hostArgs = args || [];

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
    payload: DistributeRewardDto,
  ): Promise<RewardDistribution> {
    const requestBody = {
      amount: payload.amount,
      currency: payload.currency,
    };
    const idempotency = await this.idempotencyService.beginIdempotency(
      payload.requestId,
      payload.userId,
      requestBody,
      'POST /dao/distribute-reward',
    );
    if (idempotency.state === 'replay') {
      return idempotency.body as RewardDistribution;
    }

    try {
      const user = await this.userRepo.findOne({
        where: { id: payload.userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const contractId = this.defaultContractId;
      const functionName = DAO_REWARD_FUNCTION;
      const args = [user.walletPublicKey, payload.amount, payload.currency];
      let distribution = this.rewardDistributionRepo.create({
        userId: payload.userId,
        contractId,
        functionName,
        args,
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
          functionName,
          amount: payload.amount,
          currency: payload.currency,
        },
      );

      try {
        const amountInStroops = amountToStroops(payload.amount);
        const contractArgs = [
          Address.fromString(user.walletPublicKey),
          nativeToScVal(amountInStroops, { type: 'i128' }),
          nativeToScVal(payload.currency, { type: 'symbol' }),
        ];
        const { txHash } = await this.invokeContract(
          contractId,
          functionName,
          contractArgs,
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
      } catch (err: any) {
        if (
          err instanceof HttpException &&
          err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
        ) {
          this.logger.warn('Soroban RPC unavailable - distribution aborted');
          throw err;
        }

        distribution.status = RewardDistributionStatus.FAILED;
        distribution.errorMessage =
          err?.message || 'Contract invocation failed';
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
      }

      await this.idempotencyService.storeIdempotency(
        payload.requestId,
        payload.userId,
        'POST /dao/distribute-reward',
        201,
        distribution,
        requestBody,
      );
      return distribution;
    } catch (err) {
      await this.idempotencyService.releaseIdempotency(
        payload.requestId,
        payload.userId,
      );
      throw err;
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
