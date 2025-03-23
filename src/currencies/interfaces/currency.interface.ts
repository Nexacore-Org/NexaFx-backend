import { CreateCurrencyDto } from '../dto/create-currency.dto';

export interface Currency extends CreateCurrencyDto {
    id: string;
    createdAt: Date;
    updatedAt: Date;
} 