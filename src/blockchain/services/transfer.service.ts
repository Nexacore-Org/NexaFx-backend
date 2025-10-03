import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import contractConfig from '../config/contract.config';
import { ContractTransaction, TransactionStatus, TransactionType } from '../entities/contract-transaction.entity';
import { TransferDto } from '../dto/transfer.dto';
import { WalletService } from './wallet.service';

@Injectable()
export class TransferService {
    private readonly logger = new Logger(TransferService.name);
    private server: StellarSdk.Horizon.Server;
    private networkPassphrase: string;

    constructor(
        @Inject(contractConfig.KEY)
        private config: ConfigType<typeof contractConfig>,
        @InjectRepository(ContractTransaction)
        private contractTxRepo: Repository<ContractTransaction>,
        private walletService: WalletService,
    ) {
        if (!this.config.horizonUrl) {
            throw new Error('Horizon URL is not configured');
        }
        if (!this.config.networkPassphrase) {
            throw new Error('Network passphrase is not configured');
        }

        this.server = new StellarSdk.Horizon.Server(this.config.horizonUrl);
        this.networkPassphrase = this.config.networkPassphrase;
    }

    async transfer(transferDto: TransferDto, sourceSecret: string) {
        try {
            this.logger.log(`Initiating transfer from ${transferDto.from} to ${transferDto.to}`);

            const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
            const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

            // Build transaction
            const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: this.networkPassphrase,
            });

            // Add payment operation
            if (!transferDto.assetCode || transferDto.assetCode === 'XLM') {
                // Native XLM transfer
                transaction.addOperation(
                    StellarSdk.Operation.payment({
                        destination: transferDto.to,
                        asset: StellarSdk.Asset.native(),
                        amount: transferDto.amount.toString(),
                    })
                );
            } else {
                // Custom asset transfer (e.g., NGN token)
                if (!this.config.adminPublic) {
                    throw new Error('Admin public key is not configured');
                }

                const asset = new StellarSdk.Asset(
                    transferDto.assetCode,
                    this.config.adminPublic,
                );

                transaction.addOperation(
                    StellarSdk.Operation.payment({
                        destination: transferDto.to,
                        asset: asset,
                        amount: transferDto.amount.toString(),
                    })
                );
            }

            // Add memo if provided
            if (transferDto.memo) {
                transaction.addMemo(StellarSdk.Memo.text(transferDto.memo));
            }

            // Build and sign
            const builtTx = transaction.setTimeout(180).build();
            builtTx.sign(sourceKeypair);

            // Submit to network
            const result = await this.server.submitTransaction(builtTx);

            // Save to database
            const txRecord = await this.contractTxRepo.save({
                txHash: result.hash,
                type: TransactionType.TRANSFER,
                status: TransactionStatus.SUCCESS,
                fromAddress: transferDto.from,
                toAddress: transferDto.to,
                amount: transferDto.amount,
                assetCode: transferDto.assetCode || 'XLM',
                memo: transferDto.memo,
                confirmedAt: new Date(),
                metadata: {
                    ledger: result.ledger,
                    envelope: result.envelope_xdr,
                },
            });

            this.logger.log(`Transfer successful: ${result.hash}`);

            return {
                success: true,
                transactionId: txRecord.id,
                txHash: result.hash,
                ledger: result.ledger,
            };
        } catch (error) {
            this.logger.error('Transfer failed', error);

            // Save failed transaction
            await this.contractTxRepo.save({
                txHash: 'failed_' + Date.now(),
                type: TransactionType.TRANSFER,
                status: TransactionStatus.FAILED,
                fromAddress: transferDto.from,
                toAddress: transferDto.to,
                amount: transferDto.amount,
                assetCode: transferDto.assetCode || 'XLM',
                errorMessage: error.message,
            });

            throw error;
        }
    }

    async getTransferHistory(address: string, limit: number = 20) {
        try {
            const payments = await this.server
                .payments()
                .forAccount(address)
                .order('desc')
                .limit(limit)
                .call();

            return payments.records.map((payment: any) => ({
                id: payment.id,
                type: payment.type,
                from: payment.from,
                to: payment.to,
                amount: payment.amount,
                asset: payment.asset_type === 'native' ? 'XLM' : payment.asset_code,
                createdAt: payment.created_at,
                transactionHash: payment.transaction_hash,
            }));
        } catch (error) {
            this.logger.error('Failed to get transfer history', error);
            throw error;
        }
    }
}