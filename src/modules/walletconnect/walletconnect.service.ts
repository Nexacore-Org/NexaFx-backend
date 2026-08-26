import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { WalletConnectSession } from './entities/walletconnect-session.entity';
import { StellarService } from '../stellar/stellar.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

const SESSION_TTL_DAYS = 7;

export interface InitPairingResult {
  pairingUri: string;
  sessionTopic: string;
}

export interface WalletConnectSessionInfo {
  id: string;
  sessionTopic: string;
  walletPublicKey: string;
  peerMetadata: Record<string, unknown>;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SignResult {
  signedXdr: string;
  submitted: boolean;
  txHash?: string;
}

@Injectable()
export class WalletConnectService {
  private readonly logger = new Logger(WalletConnectService.name);

  constructor(
    @InjectRepository(WalletConnectSession)
    private readonly sessionRepository: Repository<WalletConnectSession>,
    private readonly stellarService: StellarService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  async initPairing(userId: string): Promise<InitPairingResult> {
    const sessionTopic = `wc:${uuidv4().replace(/-/g, '').substring(0, 32)}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

    const session = this.sessionRepository.create({
      sessionTopic,
      walletPublicKey: '',
      peerMetadata: {},
      expiresAt,
      nexafxUserId: userId,
      isActive: true,
    });

    await this.sessionRepository.save(session);

    const pairingUri = `wc:${sessionTopic}@2?relay-protocol=irn&symKey=${uuidv4().replace(/-/g, '').substring(0, 64)}`;

    this.logger.log(
      `WalletConnect pairing initiated for user ${userId}: ${sessionTopic}`,
    );

    return { pairingUri, sessionTopic };
  }

  async approveSession(
    sessionTopic: string,
    walletPublicKey: string,
    peerMetadata: Record<string, unknown>,
  ): Promise<WalletConnectSession> {
    const session = await this.sessionRepository.findOne({
      where: { sessionTopic },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionTopic} not found`);
    }

    session.walletPublicKey = walletPublicKey;
    session.peerMetadata = peerMetadata;
    session.isActive = true;

    return this.sessionRepository.save(session);
  }

  async getActiveSessions(
    userId: string,
  ): Promise<WalletConnectSessionInfo[]> {
    const sessions = await this.sessionRepository.find({
      where: {
        nexafxUserId: userId,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    return sessions
      .filter((s) => !s.expiresAt || s.expiresAt > now)
      .map((s) => ({
        id: s.id,
        sessionTopic: s.sessionTopic,
        walletPublicKey: s.walletPublicKey,
        peerMetadata: s.peerMetadata,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
      }));
  }

  async disconnectSession(
    userId: string,
    sessionTopic: string,
  ): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { sessionTopic, nexafxUserId: userId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionTopic} not found`);
    }

    session.isActive = false;
    await this.sessionRepository.save(session);

    this.logger.log(
      `WalletConnect session disconnected: ${sessionTopic} by user ${userId}`,
    );
  }

  async signTransaction(
    userId: string,
    sessionTopic: string,
    operationType: 'payment' | 'path_payment' | 'manage_offer',
    params: Record<string, unknown>,
  ): Promise<SignResult> {
    const session = await this.sessionRepository.findOne({
      where: { sessionTopic, nexafxUserId: userId, isActive: true },
    });

    if (!session) {
      throw new NotFoundException(
        `Active session ${sessionTopic} not found for user`,
      );
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new BadRequestException('Session has expired');
    }

    const xdr = await this.buildStellarXDR(
      operationType,
      params,
      session.walletPublicKey,
    );

    this.logger.log(
      `Built XDR for session ${sessionTopic}, operation: ${operationType}`,
    );

    return {
      signedXdr: xdr,
      submitted: false,
    };
  }

  async submitSignedTransaction(
    signedXdr: string,
  ): Promise<{ submitted: boolean; txHash: string }> {
    try {
      const result = await (this.stellarService as any).server
        .submitTransaction(signedXdr);

      return {
        submitted: true,
        txHash: result.hash,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to submit signed transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException('Failed to submit transaction to Stellar');
    }
  }

  async getGuestBalance(publicKey: string): Promise<
    Array<{ asset: string; balance: string }>
  > {
    return this.stellarService.getWalletBalances(publicKey);
  }

  async linkAccount(
    userId: string,
    stellarPublicKey: string,
  ): Promise<{ linked: boolean; stellarPublicKey: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.update(userId, {
      walletAddress: stellarPublicKey,
    } as any);

    this.logger.log(
      `WalletConnect account linked: ${stellarPublicKey} to user ${userId}`,
    );

    return { linked: true, stellarPublicKey };
  }

  private async buildStellarXDR(
    operationType: string,
    params: Record<string, unknown>,
    sourcePublicKey: string,
  ): Promise<string> {
    const account = await (this.stellarService as any).server.loadAccount(
      sourcePublicKey,
    );

    const transaction = new (require('stellar-sdk')).TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: (this.stellarService as any).networkPassphrase,
    });

    switch (operationType) {
      case 'payment':
        transaction.addOperation(
          (require('stellar-sdk')).Operation.payment({
            destination: params.destination as string,
            asset: (require('stellar-sdk')).Asset.native(),
            amount: params.amount as string,
          }),
        );
        break;
      case 'path_payment':
        transaction.addOperation(
          (require('stellar-sdk')).Operation.pathPaymentStrictReceive({
            sendAsset: (require('stellar-sdk')).Asset.native(),
            sendMax: params.sendMax as string,
            destination: params.destination as string,
            destAsset: (require('stellar-sdk')).Asset.native(),
            destAmount: params.destAmount as string,
            path: (params.path as any[]) ?? [],
          }),
        );
        break;
      case 'manage_offer':
        transaction.addOperation(
          (require('stellar-sdk')).Operation.manageOffer({
            selling: (require('stellar-sdk')).Asset.native(),
            buying: (require('stellar-sdk')).Asset.native(),
            amount: params.amount as string,
            price: params.price as string,
            offerId: (params.offerId as string) ?? '0',
          }),
        );
        break;
      default:
        throw new BadRequestException(`Unsupported operation type: ${operationType}`);
    }

    const built = transaction.setTimeout(300).build();
    return built.toXDR();
  }
}
