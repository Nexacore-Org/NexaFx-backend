import { MessagingService } from './messaging.service';
import { LoansService } from '../loans/loans.service';
import { CreditScoringService } from '../loans/credit-scoring.service';
describe('probe', () => {
  it('imports', () => {
    expect(MessagingService).toBeDefined();
    expect(LoansService).toBeDefined();
    expect(CreditScoringService).toBeDefined();
  });
});
