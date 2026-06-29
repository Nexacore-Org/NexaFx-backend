import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import * as archiver from 'archiver';
import { ConfigService } from '@nestjs/config';
import { PassThrough } from 'stream';
import Mailgun from 'mailgun.js';
import * as FormData from 'form-data';

import { User } from '../../../users/user.entity';
import { Wallet } from '../../../wallets/entities/wallet.entity';
import { Transaction } from '../../../transactions/entities/transaction.entity';
import { LedgerEntry } from '../../../ledger/entities/ledger-entry.entity';
import { Notification } from '../../../notifications/entities/notification.entity';
import { KycRecord } from '../../../kyc/entities/kyc.entity';
import { AuditLog } from '../../../audit-logs/entities/audit-log.entity';
import { Referral } from '../../../referrals/entities/referral.entity';
import { RateAlert } from '../../../rate-alerts/entities/rate-alert.entity';

@Processor('gdpr-export')
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);
  private s3Client: S3Client;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Wallet) private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction) private transactionRepository: Repository<Transaction>,
    @InjectRepository(LedgerEntry) private ledgerRepository: Repository<LedgerEntry>,
    @InjectRepository(Notification) private notificationRepository: Repository<Notification>,
    @InjectRepository(KycRecord) private kycRepository: Repository<KycRecord>,
    @InjectRepository(AuditLog) private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Referral) private referralRepository: Repository<Referral>,
    @InjectRepository(RateAlert) private rateAlertRepository: Repository<RateAlert>,
  ) {
    super();
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
    });
  }

  async process(job: Job<{ userId: string, email: string }>): Promise<void> {
    const { userId, email } = job.data;
    this.logger.log(`Processing GDPR export for user ${userId}`);

    try {
      const data = await this.collectData(userId);
      const zipStream = this.createZipStream(data);
      
      const bucket = this.configService.get<string>('AWS_S3_BUCKET') || 'nexafx-exports';
      const key = `exports/nexafx-export-${userId}-${Date.now()}.zip`;

      // Upload to S3
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: zipStream,
          ContentType: 'application/zip',
        },
      });

      await upload.done();
      
      // Generate signed URL (48 hours expiry)
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 48 * 3600 });

      // Send email
      await this.sendEmail(email, signedUrl);
      this.logger.log(`Export completed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Export failed for user ${userId}`, error);
      throw error;
    }
  }

  private async collectData(userId: string) {
    const [
      user,
      wallets,
      transactions,
    ] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.walletRepository.find({ where: { userId } }),
      this.transactionRepository.find({ where: { userId } }),
    ]);

    const transactionIds = transactions.map(t => t.id);
    const ledgerEntries = transactionIds.length > 0
      ? await this.ledgerRepository.find({ where: { transactionId: (await import('typeorm')).In(transactionIds) } })
      : [];

    const [
      notifications,
      kycRecords,
      auditLogs,
      referrals,
      rateAlerts
    ] = await Promise.all([
      this.notificationRepository.find({ where: { userId } }),
      this.kycRepository.find({ where: { userId } }),
      this.auditLogRepository.find({ where: { userId } }),
      this.referralRepository.find({ where: [{ referrerId: userId }, { refereeId: userId }] }),
      this.rateAlertRepository.find({ where: { userId } }),
    ]);

    const { password, twoFactorSecret, walletSecretKeyEncrypted, ...safeProfile } = user as any;

    return {
      profile: [safeProfile],
      wallets,
      transactions,
      ledgerEntries,
      notifications,
      kycRecords,
      auditLogs,
      referrals,
      rateAlerts,
    };
  }

  private createZipStream(data: any): PassThrough {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();

    archive.pipe(passThrough);

    for (const [key, records] of Object.entries(data)) {
      const recordsArray = records as any[];
      if (recordsArray && recordsArray.length > 0) {
        archive.append(JSON.stringify(recordsArray, null, 2), { name: `${key}.json` });
        archive.append(this.convertToCSV(recordsArray), { name: `${key}.csv` });
      }
    }

    archive.finalize();
    return passThrough;
  }

  private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]).filter(key => {
      const val = data[0][key];
      return val !== null && typeof val !== 'object';
    });
    const rows = data.map(item =>
      headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        const str = String(value);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  private async sendEmail(to: string, link: string) {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL') || 'no-reply@nexafx.com';

    if (!apiKey || !domain) {
      this.logger.warn('Mailgun config missing, cannot send export email');
      return;
    }

    const mailgun = new Mailgun(FormData);
    const client = mailgun.client({ username: 'api', key: apiKey });

    await client.messages.create(domain, {
      from: `NexaFX GDPR <${fromEmail}>`,
      to: [to],
      subject: 'Your Data Export is Ready',
      text: `Your data export has been completed successfully.\n\nYou can download it here: ${link}\n\nThis link will expire in 48 hours.`,
    });
  }
}
