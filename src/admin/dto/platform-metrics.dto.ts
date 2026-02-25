export class PlatformMetricsDto {
  users: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  transactions: {
    totalCount: number;
    currentMonthCount: number;
    pendingCount: number;
    volumes: {
      deposits: {
        NGN: number;
        USD: number;
      };
      withdrawals: {
        NGN: number;
        USD: number;
      };
    };
  };
  kyc: {
    pendingReviews: number;
  };
}
