import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { CreateCurrencyDto } from './dto/create-currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private currencyRepository: Repository<Currency>,
  ) {}

  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    const existingCurrency = await this.currencyRepository.findOne({ where: { code: createCurrencyDto.code } });
    if (existingCurrency) {
      throw new ConflictException('Currency code already exists');
    }

    const currency = this.currencyRepository.create(createCurrencyDto);
    return this.currencyRepository.save(currency);
  }

  async findAll(): Promise<Currency[]> {
    return this.currencyRepository.find();
  }

  async findOne(id: string): Promise<Currency> { // Ensure id is of type string
    const currency = await this.currencyRepository.findOne({ where: { id } });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }
    return currency;
  }
  
  async remove(id: string): Promise<void> { // Ensure id is of type string
    const result = await this.currencyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Currency not found');
    }
  }
  
}
