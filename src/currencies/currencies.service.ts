import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.entity';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  /**
   * Get all supported currencies
   * @param activeOnly - If true, return only active currencies
   * @returns Array of currencies
   */
  async findAll(activeOnly = true): Promise<Currency[]> {
    const queryBuilder = this.currencyRepository.createQueryBuilder('currency');

    if (activeOnly) {
      queryBuilder.where('currency.isActive = :isActive', { isActive: true });
    }

    return queryBuilder
      .orderBy('currency.isBase', 'DESC')
      .addOrderBy('currency.code', 'ASC')
      .getMany();
  }

  /**
   * Get a specific currency by its code
   * @param code - Currency code (e.g., 'NGN', 'USD')
   * @returns Currency object
   * @throws NotFoundException if currency is not found
   */
  async getCurrency(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!currency) {
      throw new NotFoundException(`Currency with code '${code}' not found`);
    }

    return currency;
  }

  /**
   * Get the base currency (NGN)
   * @returns Base currency object
   * @throws NotFoundException if base currency is not found
   */
  async getBaseCurrency(): Promise<Currency> {
    const baseCurrency = await this.currencyRepository.findOne({
      where: { isBase: true },
    });

    if (!baseCurrency) {
      throw new NotFoundException('Base currency not found');
    }

    return baseCurrency;
  }

  /**
   * Check if a currency code is supported
   * @param code - Currency code to check
   * @returns true if currency is supported and active, false otherwise
   */
  async isSupported(code: string): Promise<boolean> {
    const currency = await this.currencyRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    return currency !== null && currency.isActive;
  }

  /**
   * Validate that a currency code is supported
   * @param code - Currency code to validate
   * @throws NotFoundException if currency is not supported
   */
  async validateCurrency(code: string): Promise<void> {
    const supported = await this.isSupported(code);
    if (!supported) {
      throw new NotFoundException(
        `Currency '${code}' is not supported or inactive`,
      );
    }
  }

  /**
   * Get a currency by ID
   * @param id - Currency ID
   * @returns Currency object
   * @throws NotFoundException if currency is not found
   */
  async findOne(id: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({
      where: { id },
    });

    if (!currency) {
      throw new NotFoundException(`Currency with ID '${id}' not found`);
    }

    return currency;
  }
}
