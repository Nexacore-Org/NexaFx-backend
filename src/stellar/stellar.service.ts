import { Injectable, Logger } from '@nestjs/common';
import { Server, Keypair, TransactionBuilder, Operation, TimeoutInfinite } from '@stellar/stellar-sdk';
import { Mutex } from 'async-mutex';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: Server;
  private readonly walletMutexes = new Map<string, Mutex>();

  constructor() {
    this.server = new Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
  }

  /**
   * Retrieves or creates a per-wallet Mutex instance to serialize
   * transactions submitted from the same source account.
   */
  private getWalletMutex(publicKey: string): Mutex {
    if (!this.walletMutexes.has(publicKey)) {
      this.walletMutexes.set(publicKey, new Mutex());
    }
    return this.walletMutexes.get(publicKey)!;
  }

  /**
   * Safely builds and submits a Stellar transaction under a per-wallet mutex,
   * fetching a fresh sequence number from Horizon and retrying automatically
   * on `tx_bad_seq` error.
   */
  async buildAndSubmit(
    sourceSecret: string,
    operations: Operation[],
    retryCount = 0,
    maxRetries = 3,
  ): Promise<any> {
    const keypair = Keypair.fromSecret(sourceSecret);
    const publicKey = keypair.publicKey();
    const mutex = this.getWalletMutex(publicKey);

    return mutex.runExclusive(async () => {
      try {
        // 1. Always fetch fresh sequence number from Horizon inside the mutex
        const account = await this.server.loadAccount(publicKey);

        // 2. Construct transaction with fresh account sequence
        const builder = new TransactionBuilder(account, {
          fee: await this.server.fetchBaseFee(),
          networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; July 2015',
        });

        for (const op of operations) {
          builder.addOperation(op);
        }

        builder.setTimeout(TimeoutInfinite);
        const transaction = builder.build();

        // 3. Sign & Submit
        transaction.sign(keypair);
        const result = await this.server.submitTransaction(transaction);
        return result;
      } catch (err: any) {
        const resultCode = err?.response?.data?.extras?.result_codes?.transaction;

        if (resultCode === 'tx_bad_seq') {
          if (retryCount < maxRetries) {
            this.logger.warn(
              `[tx_bad_seq] detected for wallet ${publicKey}. Retry attempt ${retryCount + 1}/${maxRetries} after 1s delay.`,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            // Release lock before retrying to prevent deadlock
            return this.buildAndSubmit(sourceSecret, operations, retryCount + 1, maxRetries);
          }
        }

        this.logger.error(`Stellar transaction failed for ${publicKey}: ${err.message}`, err.stack);
        throw err;
      }
    });
  }
}