import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity'; // Path matching user schemas
import { CanaryToken } from '../entities/canary-token.entity';
import { EmailService } from '../../auth/email.service';
import { EventsService } from '../../realtime/events.service';

@Injectable()
export class AlertService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly emailService: EmailService,
    private readonly eventsService: EventsService,
  ) {}

  async dispatchSuperAdminExfiltrationEmergency(canary: CanaryToken, source: string): Promise<void> {
    // 1. Fetch target notification addresses for all SUPER_ADMIN operators
    const superAdmins = await this.userRepo.find({ where: { role: 'SUPER_ADMIN' } });
    
    const alertHtml = `
      <h2>🚨 SECURITY ALERT: FRAUD CANARY TRIGGERED</h2>
      <p>A data exfiltration honeytoken trap has been tripped within the system.</p>
      <ul>
        <li><b>Canary ID:</b> ${canary.id}</li>
        <li><b>Type:</b> ${canary.type}</li>
        <li><b>Token Signature:</b> ${canary.token}</li>
        <li><b>Tripped By Vector:</b> ${source}</li>
        <li><b>Timestamp:</b> ${canary.triggeredAt.toISOString()}</li>
      </ul>
      <p>Please audit administrative system access parameters immediately.</p>
    `;

    // 2. Multicast out notifications concurrently across channels
    for (const admin of superAdmins) {
      // Direct WebSockets push
      this.eventsService.sendNewNotification(admin.id.toString(), {
        title: 'CRITICAL: Security Canary Triggered',
        canaryId: canary.id,
        type: canary.type,
        source,
      });

      // Direct email notification
      await this.emailService.sendMail(
        admin.email,
        `[CRITICAL] Security Canary Triggered: ${canary.type}`,
        alertHtml,
      );
    }
  }
}