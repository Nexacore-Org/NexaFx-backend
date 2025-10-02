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
import {
  SimulateConversionDto,
  ConversionSimulationResponse,
} from './dto/simulate-conversion.dto';
import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  CURRENCY_CONFIG,
  getCurrencyConfig,
  getExchangeRate,
  isSupportedCurrency,
} from './constants/supported-currencies';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    // Only allow creation of supported currencies
    if (!isSupportedCurrency(createCurrencyDto.code)) {
      throw new BadRequestException(
        `Only ${SUPPORTED_CURRENCIES.join(' and ')} currencies are supported`,
      );
    }

    const existingCurrency = await this.currencyRepository.findOne({
      where: { code: createCurrencyDto.code },
    });
    if (existingCurrency) {
      throw new ConflictException('Currency already exists');
    }

    // Use predefined configuration for supported currencies
    const config = getCurrencyConfig(createCurrencyDto.code as SupportedCurrency);
    const currencyData = {
      ...config,
      rate: getExchangeRate(createCurrencyDto.code as SupportedCurrency, 'USD'),
      lastUpdated: new Date(),
    };

    return this.currencyRepository.save(currencyData);
  }

  async findAll(): Promise<Currency[]> {
    // Only return supported currencies
    const currencies = await this.currencyRepository.find({
      where: SUPPORTED_CURRENCIES.map(code => ({ code })),
    });
    
    // Ensure both currencies exist, create if missing
    const result: Currency[] = [];
    
    for (const currencyCode of SUPPORTED_CURRENCIES) {
      let currency = currencies.find(c => c.code === currencyCode);
      
      if (!currency) {
        // Create missing currency
        const config = getCurrencyConfig(currencyCode);
        currency = await this.currencyRepository.save({
          ...config,
          rate: getExchangeRate(currencyCode, 'USD'),
          lastUpdated: new Date(),
        });
      }
      
      result.push(currency);
    }
    
    return result;
  }

  async findOne(code: string): Promise<Currency> {
    const upperCode = code.toUpperCase();
    
    // Only allow lookup of supported currencies
    if (!isSupportedCurrency(upperCode)) {
      throw new NotFoundException(
        `Currency ${code} is not supported. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }
    
    const currency = await this.currencyRepository.findOne({
      where: { code: upperCode },
    });
    
    if (!currency) {
      // Create the currency if it doesn't exist
      const config = getCurrencyConfig(upperCode);
      return this.currencyRepository.save({
        ...config,
        rate: getExchangeRate(upperCode, 'USD'),
        lastUpdated: new Date(),
      });
    }
    
    return currency;
  }

  async update(
    code: string,
    updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    const upperCode = code.toUpperCase();
    
    // Only allow updates to supported currencies
    if (!isSupportedCurrency(upperCode)) {
      throw new NotFoundException(
        `Currency ${code} is not supported. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }
    
    const currency = await this.currencyRepository.findOne({ where: { code: upperCode } });
    if (!currency) {
      throw new NotFoundException(`Currency with code ${code} not found`);
    }

    // Only allow updating rate and lastUpdated for supported currencies
    const allowedUpdates = {
      rate: updateCurrencyDto.rate,
      lastUpdated: new Date(),
    };

    Object.assign(currency, allowedUpdates);
    return this.currencyRepository.save(currency);
  }

  async remove(code: string): Promise<void> {
    const upperCode = code.toUpperCase();
    
    // Prevent deletion of supported currencies
    if (isSupportedCurrency(upperCode)) {
      throw new BadRequestException(
        `Cannot delete supported currency ${code}. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }
    
    const result = await this.currencyRepository.delete({ code: upperCode });
    if (result.affected === 0) {
      throw new NotFoundException(`Currency with code ${code} not found`);
    }
  }

  async simulateConversion(
    simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    const { fromCurrency, toCurrency, amount } = simulateConversionDto;

    // Validate that both currencies are supported
    if (!isSupportedCurrency(fromCurrency.toUpperCase())) {
      throw new BadRequestException(
        `Source currency ${fromCurrency} is not supported. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }

    if (!isSupportedCurrency(toCurrency.toUpperCase())) {
      throw new BadRequestException(
        `Target currency ${toCurrency} is not supported. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }

    const fromCurrencyCode = fromCurrency.toUpperCase() as SupportedCurrency;
    const toCurrencyCode = toCurrency.toUpperCase() as SupportedCurrency;

    // Get exchange rate
    const exchangeRate = getExchangeRate(fromCurrencyCode, toCurrencyCode);

    // Calculate base conversion amount
    const baseAmount = amount * exchangeRate;

    // Calculate fees (example: 0.5% fee)
    const feePercentage = 0.005; // 0.5%
    const feeAmount = baseAmount * feePercentage;
    const finalAmount = baseAmount - feeAmount;

    return {
      fromCurrency: fromCurrencyCode,
      toCurrency: toCurrencyCode,
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
