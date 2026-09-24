export class CreateBalanceAlertDto {
  walletId: string;
  assetCode: string;
  thresholdAmount: number;
  triggerType: 'BELOW' | 'ABOVE';
  notificationMethod: 'EMAIL' | 'SMS' | 'PUSH';
}

export class CheckBalanceDto {
  walletId: string;
  assetCode: string;
  currentBalance: number;
}
