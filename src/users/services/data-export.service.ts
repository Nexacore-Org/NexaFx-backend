import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream } from 'fs';
import * as archiver from 'archiver';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { Referral } from '../../referrals/entities/referral.entity';
import { User } from '../user.entity';
import {
  DataRequest,
  DataRequestType,
  DataRequestStatus,
} from '../entities/data-request.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { escapeCsvField, toCsvRow } from '../../common/utils/csv.util';

interface ExportData {
  profile: any;
  transactions: any[];
  notifications: any[];
  kycRecords: any[];
  beneficiaries: any[];
  auditLogs: any[];
  referrals: any[];
}

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);
  private readonly EXPORT_EXPIRY_HOURS = 24;
  private readonly EXPORT_DIR = path.join('/tmp', 'nexafx-exports');

  constructor(
    @InjectRepository(DataRequest)
    private readonly dataRequestRepository: Repository<DataRequest>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepository: Repository<Beneficiary>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {
    if (!fs.existsSync(this.EXPORT_DIR)) {
      fs.mkdirSync(this.EXPORT_DIR, { recursive: true });
    }
  }

  async requestDataExport(userId: string): Promise<DataRequest> {
    const existingRequest = await this.dataRequestRepository.findOne({
      where: {
        userId,
        type: DataRequestType.EXPORT,
        status: In([DataRequestStatus.PENDING, DataRequestStatus.PROCESSING]),
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'A data export request is already in progress. Please wait for it to complete.',
      );
    }

    const dataRequest = this.dataRequestRepository.create({
      userId,
      type: DataRequestType.EXPORT,
      status: DataRequestStatus.PENDING,
      requestedAt: new Date(),
      completedAt: null,
      downloadUrl: null,
      expiresAt: null,
    });

    const saved = await this.dataRequestRepository.save(dataRequest);
    this.logger.log(
      `Data export requested for user ${userId}, request ID: ${saved.id}`,
    );

    this.processDataExport(saved.id).catch((err) => {
      this.logger.error(
        `Failed to process data export for request ${saved.id}:`,
        err,
      );
    });

    return saved;
  }

  async processDataExport(requestId: string): Promise<void> {
    const request = await this.dataRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      this.logger.error(`Data export request ${requestId} not found`);
      return;
    }

    const userId = request.userId;

    try {
      request.status = DataRequestStatus.PROCESSING;
      await this.dataRequestRepository.save(request);

      this.logger.log(
        `Processing data export for user ${userId}, request ${requestId}`,
      );

      const exportData = await this.collectUserData(userId);
      await this.createZipArchive(requestId, userId, exportData);

      const expiresAt = new Date(
        Date.now() + this.EXPORT_EXPIRY_HOURS * 60 * 60 * 1000,
      );
      const downloadUrl = `/v1/users/me/data-export/${requestId}/download`;

      request.status = DataRequestStatus.COMPLETE;
      request.completedAt = new Date();
      request.downloadUrl = downloadUrl;
      request.expiresAt = expiresAt;
      await this.dataRequestRepository.save(request);

      await this.notificationsService.create(
        userId,
        NotificationType.SYSTEM,
        'Your Data Export is Ready',
        `Your data export is ready for download. The download link will expire on ${expiresAt.toISOString()}.`,
        { requestId, downloadUrl, expiresAt: expiresAt.toISOString() },
      );

      this.logger.log(
        `Data export completed for user ${userId}, request ${requestId}`,
      );
    } catch (error) {
      request.status = DataRequestStatus.FAILED;
      request.completedAt = new Date();
      await this.dataRequestRepository.save(request);

      this.logger.error(
        `Data export failed for user ${userId}, request ${requestId}:`,
        error,
      );

      try {
        await this.notificationsService.create(
          userId,
          NotificationType.SYSTEM,
          'Data Export Failed',
          'Your data export request failed. Please try again later.',
          { requestId },
        );
      } catch (notifyError) {
        this.logger.error('Failed to send failure notification:', notifyError);
      }
    }
  }

  private async collectUserData(userId: string): Promise<ExportData> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const [
      transactions,
      notifications,
      kycRecords,
      beneficiaries,
      auditLogs,
      referrals,
    ] = await Promise.all([
      this.transactionRepository.find({ where: { userId } }),
      this.notificationRepository.find({ where: { userId } }),
      this.kycRepository.find({ where: { userId } }),
      this.beneficiaryRepository.find({ where: { userId } }),
      this.auditLogRepository.find({ where: { actorId: userId } }),
      this.referralRepository.find({
        where: [{ referrerId: userId }, { refereeId: userId }],
      }),
    ]);

    const {
      password,
      walletSecretKeyEncrypted,
      twoFactorSecret,
      ...safeProfile
    } = user as any;

    return {
      profile: safeProfile,
      transactions: transactions || [],
      notifications: notifications || [],
      kycRecords: kycRecords || [],
      beneficiaries: beneficiaries || [],
      auditLogs: auditLogs || [],
      referrals: referrals || [],
    };
  }

  private getArchivePath(requestId: string, userId: string): string {
    const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    const safeRequestId = requestId.replace(/[^a-zA-Z0-9-]/g, '');
    const zipFileName = `nexafx-export_${safeUserId}_${safeRequestId}.zip`;
    const zipFilePath = path.join(this.EXPORT_DIR, zipFileName);
    if (
      !zipFilePath.startsWith(this.EXPORT_DIR + path.sep) &&
      zipFilePath !== this.EXPORT_DIR
    ) {
      throw new Error('Invalid export path detected');
    }
    return zipFilePath;
  }

  private async createZipArchive(
    requestId: string,
    userId: string,
    data: ExportData,
  ): Promise<string> {
    const zipFilePath = this.getArchivePath(requestId, userId);

    const output = createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        this.logger.log(
          `ZIP archive created: ${zipFilePath} (${archive.pointer()} bytes)`,
        );
        resolve(zipFilePath);
      });

      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);

      archive.append(JSON.stringify(data.profile, null, 2), {
        name: 'profile.json',
      });

      if (data.transactions && data.transactions.length > 0) {
        archive.append(this.convertToCSV(data.transactions), {
          name: 'transactions.csv',
        });
        archive.append(JSON.stringify(data.transactions, null, 2), {
          name: 'transactions.json',
        });
      }

      if (data.notifications && data.notifications.length > 0) {
        archive.append(this.convertToCSV(data.notifications), {
          name: 'notifications.csv',
        });
        archive.append(JSON.stringify(data.notifications, null, 2), {
          name: 'notifications.json',
        });
      }

      if (data.kycRecords && data.kycRecords.length > 0) {
        archive.append(this.convertToCSV(data.kycRecords), {
          name: 'kyc_records.csv',
        });
        archive.append(JSON.stringify(data.kycRecords, null, 2), {
          name: 'kyc_records.json',
        });
      }

      if (data.beneficiaries && data.beneficiaries.length > 0) {
        archive.append(this.convertToCSV(data.beneficiaries), {
          name: 'beneficiaries.csv',
        });
        archive.append(JSON.stringify(data.beneficiaries, null, 2), {
          name: 'beneficiaries.json',
        });
      }

      if (data.auditLogs && data.auditLogs.length > 0) {
        archive.append(this.convertToCSV(data.auditLogs), {
          name: 'audit_logs.csv',
        });
        archive.append(JSON.stringify(data.auditLogs, null, 2), {
          name: 'audit_logs.json',
        });
      }

      if (data.referrals && data.referrals.length > 0) {
        archive.append(this.convertToCSV(data.referrals), {
          name: 'referrals.csv',
        });
        archive.append(JSON.stringify(data.referrals, null, 2), {
          name: 'referrals.json',
        });
      }

      const manifest = {
        exportDate: new Date().toISOString(),
        userId,
        requestId,
        version: '1.0',
        files: [
          'profile.json',
          'transactions.csv',
          'transactions.json',
          'notifications.csv',
          'notifications.json',
          'kyc_records.csv',
          'kyc_records.json',
          'beneficiaries.csv',
          'beneficiaries.json',
          'audit_logs.csv',
          'audit_logs.json',
          'referrals.csv',
          'referrals.json',
        ],
      };
      archive.append(JSON.stringify(manifest, null, 2), {
        name: 'manifest.json',
      });

      archive.finalize();
    });
  }

  private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]).filter((key) => {
      const value = data[0][key];
      return typeof value !== 'object' || value === null;
    });

    const rows = data.map((item: any) =>
      toCsvRow(headers.map((header) => item[header])),
    );

    return [headers.map(escapeCsvField).join(','), ...rows].join('\n');
  }

  async getDownloadUrl(
    requestId: string,
    userId: string,
  ): Promise<string | null> {
    const request = await this.dataRequestRepository.findOne({
      where: { id: requestId, userId },
    });

    if (!request || request.status !== DataRequestStatus.COMPLETE) {
      return null;
    }

    if (request.expiresAt && new Date() > request.expiresAt) {
      return null;
    }

    return request.downloadUrl;
  }

  async getUserRequests(userId: string): Promise<DataRequest[]> {
    return this.dataRequestRepository.find({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });
  }

  async getExportFilePath(
    requestId: string,
    userId: string,
  ): Promise<string | null> {
    const request = await this.dataRequestRepository.findOne({
      where: { id: requestId, userId, type: DataRequestType.EXPORT },
    });

    if (!request || request.status !== DataRequestStatus.COMPLETE) {
      return null;
    }

    if (request.expiresAt && new Date() > request.expiresAt) {
      return null;
    }

    const zipPath = this.getArchivePath(requestId, userId);
    return fs.existsSync(zipPath) ? zipPath : null;
  }

  @Cron(CronExpression.EVERY_HOUR)
  cleanupExpiredExports(): { removed: number } {
    let removed = 0;

    if (!fs.existsSync(this.EXPORT_DIR)) {
      return { removed };
    }

    const cutoff = Date.now() - this.EXPORT_EXPIRY_HOURS * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(this.EXPORT_DIR)) {
      if (!entry.endsWith('.zip')) continue;
      const filePath = path.join(this.EXPORT_DIR, entry);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removed += 1;
        }
      } catch {
        // ignore
      }
    }

    return { removed };
  }

  async getRequestById(requestId: string): Promise<DataRequest | null> {
    return this.dataRequestRepository.findOne({ where: { id: requestId } });
  }

  async getAllRequests(): Promise<DataRequest[]> {
    return this.dataRequestRepository.find({
      order: { requestedAt: 'DESC' },
    });
  }

  async getRequestsByUser(userId: string): Promise<DataRequest[]> {
    return this.dataRequestRepository.find({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });
  }
}
