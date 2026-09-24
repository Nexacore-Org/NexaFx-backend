import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { GeoRestriction, RestrictionType } from './entities/geo-restriction.entity';
import { CreateGeoRestrictionDto, UpdateGeoRestrictionDto } from './dto/geo-restriction.dto';

export interface GeoCheckResult {
  blocked: boolean;
  limited: boolean;
  limitAmountUsd?: Decimal;
  reason?: string;
  restriction?: GeoRestriction;
}

@Injectable()
export class GeoRestrictionsService {
  constructor(
    @InjectRepository(GeoRestriction)
    private readonly repo: Repository<GeoRestriction>,
  ) {}

  async checkCountry(countryCode: string, direction: 'send' | 'receive'): Promise<GeoCheckResult> {
    const restrictions = await this.repo.find({
      where: { countryCode: countryCode.toUpperCase(), isActive: true },
    });

    for (const r of restrictions) {
      if (
        r.restrictionType === RestrictionType.BLOCK_ALL ||
        (direction === 'send' && r.restrictionType === RestrictionType.BLOCK_SEND) ||
        (direction === 'receive' && r.restrictionType === RestrictionType.BLOCK_RECEIVE)
      ) {
        return { blocked: true, limited: false, reason: r.reason, restriction: r };
      }
      if (r.restrictionType === RestrictionType.LIMIT && r.limitAmountUsd) {
        return {
          blocked: false,
          limited: true,
          limitAmountUsd: new Decimal(r.limitAmountUsd),
          reason: r.reason,
          restriction: r,
        };
      }
    }

    return { blocked: false, limited: false };
  }

  async findAll(): Promise<GeoRestriction[]> {
    return this.repo.find({ order: { countryCode: 'ASC' } });
  }

  async findPublic(): Promise<Pick<GeoRestriction, 'countryCode' | 'restrictionType'>[]> {
    return this.repo.find({
      where: { isActive: true },
      select: ['countryCode', 'restrictionType'],
      order: { countryCode: 'ASC' },
    });
  }

  async create(dto: CreateGeoRestrictionDto): Promise<GeoRestriction> {
    return this.repo.save(this.repo.create({ ...dto, countryCode: dto.countryCode.toUpperCase() }));
  }

  async update(id: string, dto: UpdateGeoRestrictionDto): Promise<GeoRestriction> {
    const restriction = await this.repo.findOne({ where: { id } });
    if (!restriction) throw new NotFoundException('Geo restriction not found');
    Object.assign(restriction, dto);
    return this.repo.save(restriction);
  }

  async remove(id: string): Promise<void> {
    const restriction = await this.repo.findOne({ where: { id } });
    if (!restriction) throw new NotFoundException('Geo restriction not found');
    await this.repo.delete(id);
  }
}
