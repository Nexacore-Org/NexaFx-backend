import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrenciesService } from '../currencies/currencies.service';
import { GetRateDto } from './dto/get-rate.dto';
import { GetRateResponseDto } from './dto/get-rate-response.dto';

@Injectable()
export class RatesService {
  constructor(
    private readonly currenciesService: CurrenciesService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get FX rate, fee, and net amount for a currency conversion
   * @param dto GetRateDto
   */
  async getRate(dto: GetRateDto): Promise<GetRateResponseDto> {
    let { source, target, amount = 1 } = dto;
    // Ensure currency codes are uppercase for case-insensitive lookup
    source = source.trim().toUpperCase();
    target = target.trim().toUpperCase();

    if (source === target) {
      throw new BadRequestException('Source and target currencies must be different');
    }
    let src = await this.currenciesService.findOne(source);
    if (!src) {
      throw new BadRequestException(`Unsupported source currency: ${source}`);
    }
    let tgt = await this.currenciesService.findOne(target);
    if (!tgt) {
      throw new BadRequestException(`Unsupported target currency: ${target}`);
    }
    // Defensive: Validate amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    if (src.rate == null || tgt.rate == null) {
      throw new BadRequestException(
        'Exchange rate not set for source or target currency',
      );
    }
    const rate = Number(tgt.rate) / Number(src.rate);
    const grossAmount = amount * rate;
    const feeRate = this.configService.get<number>('RATE_FEE_PERCENTAGE', 0.005);
    const fee = grossAmount * feeRate;
    const netAmount = grossAmount - fee;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    return { rate, fee, netAmount, expiresAt };
  }
}
