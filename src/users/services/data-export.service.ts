import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream } from 'fs';
import * as archiver from 'archiver';
import { format } from 'date-fns';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';
import { Referral } from '../referrals/entities/referral.entity';
import { User } from '../entities/user.entity';
import { DataRequest } from '../entities/data-request.entity';
import {
  DataRequestType,
  DataRequestStatus,
} from '../entities/data-request.entity';
import { NotificationType } from '../notifications/entities/notification.entity';

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
  ) {
    if (!fs.existsSync(this.EXPORT_DIR)) {
      fs.mkdirSync(this.EXPORT_DIR, { recursive: true });
    }
  }

  async requestDataExport(userId: string): Promise<DataRequest> {
    const existingRequest = await this.dataRequestRepository.findOne({
      where: {
        userId,
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
      const zipPath = await this.createZipArchive(userId, exportData);

      const expiresAt = new Date(
        Date.now() + this.EXPORT_EXPIRY_HOURS * 60 * 60 * 1000,
      );
      const downloadUrl = `/api/data-exports/download/${requestId}`;

      request.status = DataRequestStatus.COMPLETE;
      request.completedAt = new Date();
      request.downloadUrl = downloadUrl;
      request.expiresAt = expiresAt;
      await this.dataRequestRepository.save(request);

      await this.sendExportCompleteEmail(userId, downloadUrl, expiresAt);

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
        const auditLogRepository = this.auditLogRepository;
        await auditLogRepository.manager.query(
          'INSERT INTO notifications (id, "userId", type, title, message, "createdAt", "updatedAt", status) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW(), $5)',
          [
            userId,
            'SYSTEM',
            'Data Export Failed',
            'Your data export request failed. Please try again later.',
            'UNREAD',
          ],
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
      this.auditLogRepository.find({ where: { userId } }),
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

  private async createZipArchive(
    userId: string,
    data: ExportData,
  ): Promise<string> {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const zipFileName = `nexafx-export_${userId}_${timestamp}.zip`;
    const zipFilePath = path.join(this.EXPORT_DIR, zipFileName);

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
      headers.map((header) => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        return stringValue.includes(',') ||
          stringValue.includes('"') ||
          stringValue.includes('\n')
          ? `"${stringValue.replace(/"/g, '""')}"`
          : stringValue;
      }),
    );

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  private async sendExportCompleteEmail(
    userId: string,
    downloadUrl: string,
    expiresAt: Date,
  ): Promise<void> {
    const manager = this.auditLogRepository.manager;
    const notificationRepo = manager.getRepository(Notification);
    await notificationRepo.save(
      notificationRepo.create({
        userId,
        type: 'SYSTEM' as any,
        title: 'Your Data Export is Ready',
        message: `Your data export is ready for download. The download link will expire on ${expiresAt.toISOString()}.`,
        status: 'UNREAD' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    this.logger.log(`Export completion notification sent to user ${userId}`);
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
