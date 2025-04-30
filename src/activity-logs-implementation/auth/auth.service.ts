import { Injectable } from '@nestjs/common';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityType } from '../activity-logs/constants/activity-types.enum';

@Injectable()
export class AuthService {
  constructor(
    // ... other dependencies
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async login(user: any): Promise<any> {
    // Existing login logic
    
    // Log the login activity
    await this.activityLogsService.logActivity(
      user.id,
      ActivityType.USER_LOGIN,
      { ip: user.ip, device: user.device },
    );
    
    // Return login result
  }

  async logout(userId: string): Promise<void> {
    // Existing logout logic
    
    // Log the logout activity
    await this.activityLogsService.logActivity(
      userId,
      ActivityType.USER_LOGOUT,
    );
  }
}