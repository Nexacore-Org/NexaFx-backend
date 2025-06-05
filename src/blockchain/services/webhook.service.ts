import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';
import * as stellarSdk from 'stellar-sdk';

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private readonly server: stellarSdk.Horizon.Server;
  private eventStreamCloseFn: () => void;
  private isStreamActive = false;
  private readonly sourcePublicKey: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {
    // Initialize Stellar configuration
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ||
      'https://horizon-testnet.stellar.org';
    this.server = new stellarSdk.Horizon.Server(horizonUrl);

    // Get the platform wallet public key
    const secretKey = this.configService.get<string>('STELLAR_SECRET_KEY');
    if (secretKey) {
      this.sourcePublicKey =
        stellarSdk.Keypair.fromSecret(secretKey).publicKey();
    } else {
      this.logger.error(
        'STELLAR_SECRET_KEY is not defined in environment variables',
      );
    }
  }

  async onModuleInit() {
    await this.startPaymentEventStream();
  }

  onModuleDestroy() {
    this.stopPaymentEventStream();
  }

  private async startPaymentEventStream() {
    if (!this.sourcePublicKey) {
      this.logger.error(
        'Cannot start payment event stream: source public key not available',
      );
      return;
    }

    try {
      this.logger.log('Starting Stellar payment event stream...');

      // Create a payment stream for the platform account
      const paymentStream = this.server
        .payments()
        .forAccount(this.sourcePublicKey)
        .cursor('now')
        .stream({
          onmessage: this.handlePaymentEvent.bind(this),
          onerror: (error: any) => {
            this.logger.error(
              `Payment stream error: ${error.message || 'Unknown error'}`,
              error.stack || 'No stack trace available',
            );
            // Attempt to reconnect after a delay
            setTimeout(() => {
              if (this.isStreamActive) {
                this.stopPaymentEventStream();
                this.startPaymentEventStream();
              }
            }, 10000); // 10 seconds delay
          },
        });

      // Store the close function directly
      this.eventStreamCloseFn = paymentStream;

      this.isStreamActive = true;
      this.logger.log('Stellar payment event stream started successfully');
    } catch (error) {
      this.logger.error(
        `Failed to start payment event stream: ${error.message}`,
        error.stack,
      );
    }
  }

  private stopPaymentEventStream() {
    if (this.eventStreamCloseFn) {
      this.eventStreamCloseFn();
      this.isStreamActive = false;
      this.logger.log('Stellar payment event stream stopped');
    }
  }

  private async handlePaymentEvent(payment: any) {
    try {
      // Only process payments received by our account (not sent)
      if (payment.to !== this.sourcePublicKey) {
        return;
      }

      this.logger.debug(`Received payment event: ${JSON.stringify(payment)}`);

      // Get the transaction details
      const transaction = await this.server
        .transactions()
        .transaction(payment.transaction_hash)
        .call();

      if (!transaction) {
        this.logger.warn(
          `Transaction ${payment.transaction_hash} not found on the network`,
        );
        return;
      }

      // Extract memo if available (might contain order ID or other reference)
      let memo: string | null = null;
      if (transaction.memo) {
        memo = String(transaction.memo); // Convert to string explicitly
      }

      // Find the transaction in our database
      const dbTransaction = await this.transactionRepository.findOne({
        where: {
          txHash: payment.transaction_hash,
          status: TransactionStatus.PENDING,
        },
      });

      if (!dbTransaction) {
        this.logger.warn(
          `Transaction ${payment.transaction_hash} not found in database or already confirmed`,
        );
        return;
      }

      // Update the transaction status
      dbTransaction.status = TransactionStatus.COMPLETED;
      dbTransaction.updatedAt = new Date();
      dbTransaction.metadata = {
        ...dbTransaction.metadata,
        ledger: transaction.ledger,
        confirmed_at: new Date().toISOString(),
        memo: memo,
      };

      // Save the updated transaction
      await this.transactionRepository.save(dbTransaction);
      this.logger.log(
        `Transaction ${payment.transaction_hash} confirmed successfully`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error processing payment event: ${error?.message || 'Unknown error'}`,
        error?.stack || 'No stack trace available',
      );
    }
  }

  async restartPaymentEventStream() {
    this.stopPaymentEventStream();
    await this.startPaymentEventStream();
    return { success: true, message: 'Payment event stream restarted' };
  }
}
