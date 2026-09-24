import { Test, TestingModule } from '@nestjs/testing';
import { FraudRingService, TxHop } from './fraud-ring.service';
import { FraudRingStatus } from '../entities/fraud-ring.entity';

describe('FraudRingService (Issue #771)', () => {
  let service: FraudRingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FraudRingService],
    }).compile();

    service = module.get<FraudRingService>(FraudRingService);
  });

  it('should detect a valid 3-participant fraud ring A->B->C->A within 24 hours', async () => {
    const now = new Date();
    const hops: TxHop[] = [
      { id: 'tx_1', senderUserId: 'userA', recipientUserId: 'userB', amountUsd: 1000, timestamp: now, isNewPair: true },
      { id: 'tx_2', senderUserId: 'userB', recipientUserId: 'userC', amountUsd: 950, timestamp: new Date(now.getTime() + 3600000), isNewPair: true },
      { id: 'tx_3', senderUserId: 'userC', recipientUserId: 'userA', amountUsd: 920, timestamp: new Date(now.getTime() + 7200000), isNewPair: false },
    ];

    const rings = await service.analyse(hops);
    expect(rings.length).toBe(1);
    expect(rings[0].participants).toEqual(['userA', 'userB', 'userC']);
    expect(rings[0].status).toBe(FraudRingStatus.OPEN);
  });

  it('should NOT flag a ring if amounts differ > 30% between hops', async () => {
    const now = new Date();
    const hops: TxHop[] = [
      { id: 'tx_1', senderUserId: 'userA', recipientUserId: 'userB', amountUsd: 1000, timestamp: now, isNewPair: true },
      { id: 'tx_2', senderUserId: 'userB', recipientUserId: 'userC', amountUsd: 500, timestamp: new Date(now.getTime() + 3600000), isNewPair: true },
      { id: 'tx_3', senderUserId: 'userC', recipientUserId: 'userA', amountUsd: 480, timestamp: new Date(now.getTime() + 7200000), isNewPair: true },
    ];

    const rings = await service.analyse(hops);
    expect(rings.length).toBe(0);
  });

  it('should NOT flag a 7-participant ring exceeding max participant threshold of 6', async () => {
    const now = new Date();
    const hops: TxHop[] = [
      { id: 'tx_1', senderUserId: 'user1', recipientUserId: 'user2', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_2', senderUserId: 'user2', recipientUserId: 'user3', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_3', senderUserId: 'user3', recipientUserId: 'user4', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_4', senderUserId: 'user4', recipientUserId: 'user5', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_5', senderUserId: 'user5', recipientUserId: 'user6', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_6', senderUserId: 'user6', recipientUserId: 'user7', amountUsd: 100, timestamp: now, isNewPair: true },
      { id: 'tx_7', senderUserId: 'user7', recipientUserId: 'user1', amountUsd: 100, timestamp: now, isNewPair: true },
    ];

    const rings = await service.analyse(hops);
    expect(rings.length).toBe(0);
  });

  it('should auto-freeze all participant wallets when ring is confirmed', async () => {
    const now = new Date();
    const hops: TxHop[] = [
      { id: 'tx_1', senderUserId: 'uA', recipientUserId: 'uB', amountUsd: 500, timestamp: now, isNewPair: true },
      { id: 'tx_2', senderUserId: 'uB', recipientUserId: 'uC', amountUsd: 490, timestamp: now, isNewPair: true },
      { id: 'tx_3', senderUserId: 'uC', recipientUserId: 'uA', amountUsd: 480, timestamp: now, isNewPair: false },
    ];

    const [ring] = await service.analyse(hops);
    const confirmed = await service.confirmRing(ring.id, 'admin_super_1');

    expect(confirmed.ring.status).toBe(FraudRingStatus.CONFIRMED);
    expect(service.isWalletFrozen('uA')).toBe(true);
    expect(service.isWalletFrozen('uB')).toBe(true);
    expect(service.isWalletFrozen('uC')).toBe(true);
  });
});
