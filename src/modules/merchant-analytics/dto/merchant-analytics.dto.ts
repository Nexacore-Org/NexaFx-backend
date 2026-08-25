export class AnalyticsQueryDto {
  merchantId: string;
  startDate: string;
  endDate: string;
}

export class ExportAnalyticsDto extends AnalyticsQueryDto {
  format: 'csv' | 'json';
}
