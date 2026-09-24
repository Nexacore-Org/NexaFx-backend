import { Test, TestingModule } from '@nestjs/testing';
import { DisputeEngineService } from './dispute-engine.service';
import { NotFoundException } from '@nestjs/common';

describe('DisputeEngineService', () => {
  let service: DisputeEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DisputeEngineService],
    }).compile();

    service = module.get<DisputeEngineService>(DisputeEngineService);
  });

  it('should auto-reject small disputes without evidence', async () => {
    const result = await service.processDispute({
      disputeId: 'd-1',
      transactionId: 't-1',
      amount: 5,
      reasonCode: 'ITEM_NOT_RECEIVED',
      evidenceProvided: false
    });
    
    expect(result.status).toBe('AUTO_REJECT');
  });

  it('should auto-chargeback fraud claims with evidence', async () => {
    const result = await service.processDispute({
      disputeId: 'd-2',
      transactionId: 't-2',
      amount: 500,
      reasonCode: 'FRAUD',
      evidenceProvided: true
    });
    
    expect(result.status).toBe('AUTO_CHARGEBACK');
  });

  it('should route complex disputes to manual review', async () => {
    const result = await service.processDispute({
      disputeId: 'd-3',
      transactionId: 't-3',
      amount: 500,
      reasonCode: 'ITEM_NOT_AS_DESCRIBED',
      evidenceProvided: true
    });
    
    expect(result.status).toBe('PENDING_MANUAL_REVIEW');
  });

  it('should allow admin overrides', async () => {
    await service.processDispute({
      disputeId: 'd-4',
      transactionId: 't-4',
      amount: 500,
      reasonCode: 'ITEM_NOT_AS_DESCRIBED',
      evidenceProvided: true
    });
    
    const overridden = service.overrideDecision({
      disputeId: 'd-4',
      adminId: 'admin-1',
      newOutcome: 'MANUAL_REFUND',
      notes: 'Customer provided offline evidence'
    });
    
    expect(overridden.status).toBe('MANUAL_REFUND');
    expect(overridden.adminId).toBe('admin-1');
  });
});
