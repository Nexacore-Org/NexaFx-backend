export class CurrencyDto {
  id: string;
  code: string;
  name: string;
  decimals: number;
  isBase: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
