import { ReferralStatus } from '../entities/referral.entity';

export class ReferralItemDto {
  id: string;
  status: ReferralStatus;
  rewardAmount: string | null;
  rewardCurrency: string | null;
  rewardedAt: Date | null;
  createdAt: Date;
  referee: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
  };
}
