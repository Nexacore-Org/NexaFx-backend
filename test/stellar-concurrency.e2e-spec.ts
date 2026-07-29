import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from '../src/stellar/stellar.service';
import { Keypair, Operation } from '@stellar/stellar-sdk';

describe('Stellar Concurrency Test (#783)', () => {
  let stellarService: StellarService;
  // Test hot wallet secret with funded testnet balance
  const testSecret = process.env.TEST_HOT_WALLET_SECRET || 'SDXXX...';
  const testKeypair = Keypair.fromSecret(testSecret);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();

    stellarService = module.get<StellarService>(StellarService);
  });

  it('handles 20 concurrent transactions from the same wallet without tx_bad_seq errors', async () => {
    const destinationKeypair = Keypair.random();

    // Create 20 concurrent transaction promises
    const txPromises = Array.from({ length: 20 }).map(() =>
      stellarService.buildAndSubmit(testSecret, [
        Operation.payment({
          destination: destinationKeypair.publicKey(),
          asset: Asset.native(),
          amount: '0.00001',
        }),
      ]),
    );

    const results = await Promise.allSettled(txPromises);
    const rejected = results.filter((r) => r.status === 'rejected');
    
    // Ensure all 20 succeeded
    expect(rejected.length).toBe(0);
  }, 60000);
});