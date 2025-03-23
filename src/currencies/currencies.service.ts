import { Injectable } from '@nestjs/common';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { Currency } from './interfaces/currency.interface';

@Injectable()
export class CurrenciesService {
    private currencies: Currency[] = [];

    async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
        const currency: Currency = {
            id: Date.now().toString(), // Simple ID generation for now
            ...createCurrencyDto,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.currencies.push(currency);
        return currency;
    }

    async findAll(): Promise<Currency[]> {
        return this.currencies;
    }

    async findOne(id: string): Promise<Currency | undefined> {
        return this.currencies.find(currency => currency.id === id);
    }

    async remove(id: string): Promise<{ success: boolean; message: string }> {
        const index = this.currencies.findIndex(currency => currency.id === id);
        if (index > -1) {
            this.currencies.splice(index, 1);
            return { success: true, message: 'Currency removed successfully' };
        }
        return { success: false, message: 'Currency not found' };
    }
}
