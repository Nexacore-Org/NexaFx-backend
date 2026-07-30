export type SharedReportType =
  | 'INCOME_SUMMARY'
  | 'TRANSACTION_HISTORY'
  | 'PORTFOLIO_SNAPSHOT';

export class CreateSharedReportDto {
  userId: string;
  reportType: SharedReportType;
  fromDate: string;
  toDate: string;
}

export class VerifyReportDto {
  shareToken: string;
  verificationHash: string;
}
