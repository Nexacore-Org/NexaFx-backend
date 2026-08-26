import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  FaucetRequest,
  FaucetRequestStatus,
} from './entities/faucet-request.entity';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const DEFAULT_COOLDOWN_MINUTES = 60;
const DEFAULT_FAUCET_AMOUNT_XLM = '10';

export interface RequestFaucetDto {
  stellarPublicKey: string;
  amount?: string;
}

export interface FaucetResponseDto {
  id: string;
  stellarPublicKey: string;
  amountXlm: string;
  status: FaucetRequestStatus;
  txHash: string | null;
  createdAt: Date;
}

@Injectable()
export class TestnetFaucetService {
  private readonly logger = new Logger(TestnetFaucetService.name);

  constructor(
    @InjectRepository(FaucetRequest)
    private readonly faucetRequestRepo: Repository<FaucetRequest>,
    private readonly configService: ConfigService,
  ) {}

  private get isTestnet(): boolean {
    const network = this.configService.get<string>('STELLAR_NETWORK', 'TESTNET');
    return network.toUpperCase() === 'TESTNET';
  }

  private get cooldownMinutes(): number {
    return this.configService.get<number>(
      'FAUCET_COOLDOWN_MINUTES',
      DEFAULT_COOLDOWN_MINUTES,
    );
  }

  private get faucetAmount(): string {
    return this.configService.get<string>(
      'FAUCET_AMOUNT_XLM',
      DEFAULT_FAUCET_AMOUNT_XLM,
    );
  }

  async requestFaucet(
    dto: RequestFaucetDto,
    userId: string | null,
    ipAddress: string,
  ): Promise<FaucetResponseDto> {
    if (!this.isTestnet) {
      throw new BadRequestException(
        'Testnet faucet is only available on the TESTNET network',
      );
    }

    this.validateStellarPublicKey(dto.stellarPublicKey);

    const amount = dto.amount || this.faucetAmount;
    this.validateAmount(amount);

    await this.checkCooldown(dto.stellarPublicKey);

    const request = this.faucetRequestRepo.create({
      stellarPublicKey: dto.stellarPublicKey,
      amountXlm: amount,
      requestedBy: userId,
      ipAddress,
      status: FaucetRequestStatus.PROCESSING,
    });

    const saved = await this.faucetRequestRepo.save(request);

    try {
      const txHash = await this.fundFromFriendbot(
        dto.stellarPublicKey,
        amount,
      );

      saved.status = FaucetRequestStatus.COMPLETED;
      saved.txHash = txHash;
      await this.faucetRequestRepo.save(saved);

      return this.toResponseDto(saved);
    } catch (error) {
      saved.status = FaucetRequestStatus.FAILED;
      await this.faucetRequestRepo.save(saved);

      this.logger.error(
        `Faucet funding failed for ${dto.stellarPublicKey}: ${error}`,
      );
      throw new BadRequestException('Failed to fund account via Friendbot');
    }
  }

  async getRequestStatus(id: string): Promise<FaucetResponseDto> {
    const request = await this.faucetRequestRepo.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Faucet request not found');
    }

    return this.toResponseDto(request);
  }

  private async checkCooldown(stellarPublicKey: string): Promise<void> {
    const cooldownAgo = new Date(
      Date.now() - this.cooldownMinutes * 60 * 1000,
    );

    const recentRequest = await this.faucetRequestRepo.findOne({
      where: {
        stellarPublicKey,
        status: FaucetRequestStatus.COMPLETED,
        createdAt: MoreThan(cooldownAgo),
      },
    });

    if (recentRequest) {
      const waitMinutes = Math.ceil(
        (recentRequest.createdAt.getTime() +
          this.cooldownMinutes * 60 * 1000 -
          Date.now()) /
          60000,
      );
      throw new BadRequestException(
        `Cooldown active. Please wait ${waitMinutes} minutes before requesting again.`,
      );
    }
  }

  private async fundFromFriendbot(
    publicKey: string,
    amount: string,
  ): Promise<string> {
    const url = `${FRIENDBOT_URL}?addr=${publicKey}&amount=${amount}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Friendbot returned status ${response.status}`);
    }

    const data = await response.json();
    return data.hash || data.result?.hash || 'unknown';
  }

  private validateStellarPublicKey(key: string): void {
    if (!key || key.length !== 56 || !key.startsWith('G')) {
      throw new BadRequestException(
        'Invalid Stellar public key. Must be 56 characters starting with G.',
      );
    }
  }

  private validateAmount(amount: string): void {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0 || num > 100) {
      throw new BadRequestException(
        'Invalid amount. Must be between 0 and 100 XLM.',
      );
    }
  }

  private toResponseDto(request: FaucetRequest): FaucetResponseDto {
    return {
      id: request.id,
      stellarPublicKey: request.stellarPublicKey,
      amountXlm: request.amountXlm,
      status: request.status,
      txHash: request.txHash,
      createdAt: request.createdAt,
    };
  }
}
