import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { Repository } from 'typeorm';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    const existingCurrency = await this.currencyRepository.findOne({
      where: { code: createCurrencyDto.code },
    });
    if (existingCurrency) {
      throw new ConflictException('Currency already exists');
    }

    return this.currencyRepository.save(createCurrencyDto);
  }

  async findAll(): Promise<Currency[]> {
    return this.currencyRepository.find();
  }

  async findOne(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({
      where: { code },
    });
    if (!currency) {
      throw new NotFoundException(`Currency with code ${code} does not exist`);
    }
    return currency;
  }

  async update(
    code: string,
    updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({ where: { code } });
    if (!currency) {
      throw new NotFoundException(`Currency with code ${code} not found`);
    }

    Object.assign(currency, updateCurrencyDto);
    return this.currencyRepository.save(currency);
  }

  async remove(code: string): Promise<void> {
    const result = await this.currencyRepository.delete({ code });
    if (result.affected === 0) {
      throw new NotFoundException(`Currency with code ${code} not found`);
    }
  }
}
