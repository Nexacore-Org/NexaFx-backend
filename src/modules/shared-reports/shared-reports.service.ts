import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHmac } from 'crypto';
import { CreateSharedReportDto, SharedReportType } from './dto/shared-report.dto';

export interface SharedReport {
  id: string;
  userId: string;
  reportType: SharedReportType;
  fromDate: string;
  toDate: string;
  shareToken: string;
  isActive: boolean;
  viewCount: number;
  expiresAt: Date;
  verificationHash: string;
  createdAt: Date;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * In-memory shareable-report store. Report data is computed on demand from
 * a placeholder summary rather than a real ledger query, and "storage" is a
 * process-local Map rather than S3 — a small, self-contained scaffold.
 */
@Injectable()
export class SharedReportsService {
  private reports = new Map<string, SharedReport>();
  private readonly signingKey: string;

  constructor(private readonly configService: ConfigService) {
    this.signingKey =
      this.configService.get<string>('REPORT_SIGNING_KEY') ?? 'dev-only-signing-key';
  }

  generate(dto: CreateSharedReportDto): { shareToken: string; shareUrl: string } {
    const shareToken = randomUUID();
    const totalValue = 0; // placeholder until wired to the real ledger/reporting query
    const verificationHash = this.computeHash(
      shareToken,
      dto.fromDate,
      dto.toDate,
      totalValue,
    );

    const report: SharedReport = {
      id: randomUUID(),
      userId: dto.userId,
      reportType: dto.reportType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      shareToken,
      isActive: true,
      viewCount: 0,
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      verificationHash,
      createdAt: new Date(),
    };

    this.reports.set(shareToken, report);
    return { shareToken, shareUrl: `https://nexafx.com/report/${shareToken}` };
  }

  listForUser(userId: string): SharedReport[] {
    return Array.from(this.reports.values()).filter((r) => r.userId === userId);
  }

  deactivate(id: string): void {
    const report = this.findById(id);
    report.isActive = false;
  }

  extend(id: string): SharedReport {
    const report = this.findById(id);
    report.expiresAt = new Date(report.expiresAt.getTime() + THIRTY_DAYS_MS);
    return report;
  }

  getPublic(shareToken: string) {
    const report = this.reports.get(shareToken);
    if (!report || !report.isActive) {
      throw new NotFoundException('Report not found');
    }
    if (report.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Report link has expired');
    }

    report.viewCount += 1;

    return {
      reportType: report.reportType,
      fromDate: report.fromDate,
      toDate: report.toDate,
      viewCount: report.viewCount,
      verificationHash: report.verificationHash,
      data: this.buildAnonymisedData(report.reportType),
    };
  }

  verifyHash(shareToken: string, verificationHash: string): { valid: boolean } {
    const report = this.reports.get(shareToken);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return { valid: report.verificationHash === verificationHash };
  }

  private findById(id: string): SharedReport {
    const report = Array.from(this.reports.values()).find((r) => r.id === id);
    if (!report) {
      throw new NotFoundException(`Shared report ${id} not found`);
    }
    return report;
  }

  private computeHash(
    shareToken: string,
    fromDate: string,
    toDate: string,
    totalValue: number,
  ): string {
    return createHmac('sha256', this.signingKey)
      .update(`${shareToken}${fromDate}${toDate}${totalValue}`)
      .digest('hex');
  }

  /** Anonymised placeholder payload — no counterparty names/emails. */
  private buildAnonymisedData(reportType: SharedReportType) {
    switch (reportType) {
      case 'INCOME_SUMMARY':
        return { totalReceived: 0, totalSent: 0, net: 0, topCurrencies: [] };
      case 'TRANSACTION_HISTORY':
        return { transactions: [] as Array<{ counterparty: string; amount: number }> };
      case 'PORTFOLIO_SNAPSHOT':
        return { totalValue: 0, breakdown: [] as Array<{ assetType: string; value: number }> };
    }
  }
}
