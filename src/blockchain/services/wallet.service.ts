import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import contractConfig from '../config/contract.config';
import { BlockchainWallet } from '../entities/wallet.entity';
import { CreateWalletDto } from '../dto/create-wallet.dto';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);
    private server: StellarSdk.Horizon.Server;
    private readonly encryptionKey: Buffer;
    private readonly algorithm = 'aes-256-cbc';
    private readonly ivLength = 16;

    constructor(
        @Inject(contractConfig.KEY)
        private config: ConfigType<typeof contractConfig>,
        @InjectRepository(BlockchainWallet)
        private walletRepo: Repository<BlockchainWallet>,
    ) {
        if (!this.config.horizonUrl) {
            throw new Error('Horizon URL is not configured');
        }

        this.server = new StellarSdk.Horizon.Server(this.config.horizonUrl);

        // In production, use a secure key management system
        const keyString = process.env.WALLET_ENCRYPTION_KEY || 'default-key-change-in-production-min-32-chars';
        this.encryptionKey = crypto.scryptSync(keyString, 'salt', 32);
    }

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    private decrypt(encrypted: string): string {
        const parts = encrypted.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    async createWallet(createWalletDto: CreateWalletDto) {
        try {
            this.logger.log(`Creating wallet for user: ${createWalletDto.userId}`);

            // Generate new Stellar keypair
            const keypair = StellarSdk.Keypair.random();
            const publicKey = keypair.publicKey();
            const secretKey = keypair.secret();

            // Encrypt the secret key
            const encryptedSecret = this.encrypt(secretKey);

            // Save to database
            const wallet = await this.walletRepo.save({
                publicKey,
                encryptedSecret,
                userId: createWalletDto.userId,
                label: createWalletDto.label || 'Main Wallet',
            });

            // In testnet, fund the account with Friendbot
            if (this.config.network === 'TESTNET') {
                try {
                    await this.fundTestnetAccount(publicKey);
                    this.logger.log(`Funded testnet account: ${publicKey}`);
                } catch (error) {
                    this.logger.warn('Failed to fund testnet account', error);
                }
            }

            return {
                id: wallet.id,
                publicKey: wallet.publicKey,
                label: wallet.label,
                createdAt: wallet.createdAt,
            };
        } catch (error) {
            this.logger.error('Failed to create wallet', error);
            throw error;
        }
    }

    private async fundTestnetAccount(publicKey: string) {
        const response = await fetch(
            `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
        );

        if (!response.ok) {
            throw new Error('Friendbot funding failed');
        }

        return response.json();
    }

    async getWalletBalance(address: string) {
        try {
            const account = await this.server.loadAccount(address);

            const balances = account.balances.map((balance: any) => ({
                asset: balance.asset_type === 'native' ? 'XLM' : balance.asset_code,
                balance: balance.balance,
                limit: balance.limit,
            }));

            return {
                address,
                balances,
                sequence: account.sequence,
            };
        } catch (error) {
            this.logger.error(`Failed to get balance for ${address}`, error);
            throw error;
        }
    }

    async getUserWallets(userId: string) {
        const wallets = await this.walletRepo.find({
            where: { userId, isActive: true },
            select: ['id', 'publicKey', 'label', 'createdAt'],
        });

        return wallets;
    }

    async getWalletByPublicKey(publicKey: string) {
        return await this.walletRepo.findOne({
            where: { publicKey, isActive: true },
            select: ['id', 'publicKey', 'label', 'userId', 'createdAt'],
        });
    }

    async getWalletSecret(walletId: string, userId: string): Promise<string> {
        const wallet = await this.walletRepo.findOne({
            where: { id: walletId, userId, isActive: true },
        });

        if (!wallet) {
            throw new Error('Wallet not found or access denied');
        }

        return this.decrypt(wallet.encryptedSecret);
    }
}