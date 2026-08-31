import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RegulatoryReportHistory, ReportType } from './entities/regulatory-report-schedule.entity';
import { MailgunService } from '../mailgun/mailgun.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RegulatoryReportingService {
  private readonly logger = new Logger(RegulatoryReportingService.name);

  constructor(
    @InjectRepository(RegulatoryReportHistory)
    private readonly historyRepo: Repository<RegulatoryReportHistory>,
    private readonly dataSource: DataSource,
    private readonly mailgunService: MailgunService,
  ) {}

  public async getReportHistory(): Promise<RegulatoryReportHistory[]> {
    return this.historyRepo.find({ order: { generatedAt: 'DESC' } });
  }

  @Cron(CronExpression.EVERY_WEEK)
  public async handleScheduledReports(): Promise<void> {
    this.logger.log('Executing scheduled regulatory report generation...');
    await this.generateAndDispatchReport(ReportType.LARGE_TX_SUMMARY, 'compliance@regulatory.gov');
    await this.generateAndDispatchReport(ReportType.SUSPICIOUS_ACTIVITY_SUMMARY, 'compliance@regulatory.gov');
  }

  public async generateAndDispatchReport(reportType: ReportType, recipientEmail: string): Promise<RegulatoryReportHistory> {
    let aggregateData: any;

    if (reportType === ReportType.LARGE_TX_SUMMARY) {
      // Query ledger entries via DataSource to avoid separate source of truth
      aggregateData = await this.dataSource.query(
        `SELECT currency, COUNT(*) as total_count, SUM(amount) as total_volume FROM ledger_entries WHERE amount > 10000 GROUP BY currency`,
      );
    } else {
      // Query compliance flags
      aggregateData = await this.dataSource.query(
        `SELECT risk_level, COUNT(*) as flag_count FROM compliance_flags GROUP BY risk_level`,
      );
    }

    const reportJson = JSON.stringify(aggregateData);
    const downloadUrl = `https://api.nexafx.com/v2/regulatory-reporting/downloads/${Date.now()}`;

    const history = this.historyRepo.create({
      reportType,
      reportData: reportJson,
      downloadUrl,
    });
    const savedHistory = await this.historyRepo.save(history);

    // Dispatch via existing MailgunService
    await this.mailgunService.sendEmail({
      to: recipientEmail,
      subject: `Regulatory Compliance Report: ${reportType}`,
      text: `Your scheduled compliance report is ready. Download link: ${downloadUrl}`,
    });

    return savedHistory;
  }
}