

// **src/wallet/wallet.service.ts** (partial)


import { Injectable } from '@nestjs/common';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityType } from '../activity-logs/constants/activity-types.enum';

@Injectable()
export class WalletService {
  constructor(
    // ... other dependencies
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async linkWallet(userId: string, walletAddress: string): Promise<any> {
    // Existing wallet linking logic
    
    // Log the wallet linking activity
    await this.activityLogsService.logActivity(
      userId,
      ActivityType.WALLET_LINKED,
      { walletAddress },
    );
    
    // Return linking result
  }

  async unlinkWallet(userId: string, walletAddress: string): Promise<any> {
    // Existing wallet unlinking logic
    
    // Log the wallet unlinking activity
    await this.activityLogsService.logActivity(
      userId,
      ActivityType.WALLET_UNLINKED,
      { walletAddress },
    );
    
    // Return unlinking result
  }
}