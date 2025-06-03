import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { Repository } from 'typeorm';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { SimulateConversionDto, ConversionSimulationResponse } from './dto/simulate-conversion.dto';

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

  async simulateConversion(
    simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    const { fromCurrency, toCurrency, amount } = simulateConversionDto;

    // Get both currencies
    const [sourceCurrency, targetCurrency] = await Promise.all([
      this.findOne(fromCurrency),
      this.findOne(toCurrency),
    ]);

    if (!sourceCurrency.rate || !targetCurrency.rate) {
      throw new BadRequestException('Exchange rates not available for one or both currencies');
    }

    // Calculate exchange rate
    const exchangeRate = targetCurrency.rate / sourceCurrency.rate;

    // Calculate base conversion amount
    const baseAmount = amount * exchangeRate;

    // Calculate fees (example: 0.5% fee)
    const feePercentage = 0.005; // 0.5%
    const feeAmount = baseAmount * feePercentage;
    const finalAmount = baseAmount - feeAmount;

    return {
      fromCurrency: sourceCurrency.code,
      toCurrency: targetCurrency.code,
      inputAmount: amount,
      outputAmount: finalAmount,
      exchangeRate,
      fees: {
        amount: feeAmount,
        percentage: feePercentage * 100, // Convert to percentage
      },
      timestamp: new Date(),
    };
  }
}
